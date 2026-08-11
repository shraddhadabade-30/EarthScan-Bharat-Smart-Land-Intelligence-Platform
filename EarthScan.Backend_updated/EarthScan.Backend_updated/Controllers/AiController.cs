using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using EarthScan.Backend.Data;
using EarthScan.Backend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace EarthScan.Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AiController : ControllerBase
    {
        private readonly EarthScanDbContext _context;
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public AiController(EarthScanDbContext context, IConfiguration configuration)
        {
            _context = context;
            _httpClient = new HttpClient();
            _configuration = configuration;
        }

        public class ChatRequest
        {
            public int UserId { get; set; }
            public string Question { get; set; } = string.Empty;
            public string Location { get; set; } = string.Empty;
            public string SoilInfo { get; set; } = string.Empty;
            public string WeatherInfo { get; set; } = string.Empty;
            public string? Lang { get; set; }
        }

        [HttpPost("chat")]
        public async Task<IActionResult> Chat([FromBody] ChatRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Question))
            {
                return BadRequest("Question cannot be empty.");
            }

            var apiKey = _configuration["ApiKeys:Gemini"];
            if (string.IsNullOrEmpty(apiKey))
            {
                return StatusCode(500, "Gemini API key is not configured.");
            }

            string mandiContext = "";
            string schemesContext = "";
            try
            {
                var prices = await _context.MandiPrices.Take(5).ToListAsync();
                mandiContext = string.Join("; ", prices.Select(p => $"{p.Commodity} at {p.Market}: Modal ₹{p.ModalPrice}/q"));
                
                var schemes = await _context.GovernmentSchemes.Take(5).ToListAsync();
                schemesContext = string.Join("; ", schemes.Select(s => $"{s.Name}: {s.Benefit}"));
            }
            catch { }

            string systemPrompt = $@"You are 'Krishi Mitra', an agricultural AI advisory assistant.
Context:
- Location: {request.Location}
- Weather: {request.WeatherInfo}
- Soil: {request.SoilInfo}
- Mandi Rates: {mandiContext}
- Schemes: {schemesContext}

Answer the farmer's question using this context in markdown format. Question: ""{request.Question}""";

            if (!string.IsNullOrEmpty(request.Lang))
            {
                var cleanLang = request.Lang.Trim().ToLower();
                if (cleanLang.StartsWith("mr"))
                {
                    systemPrompt += "\nIMPORTANT: You must write the response strictly in Marathi language (मराठीत उत्तर द्या).";
                }
                else if (cleanLang.StartsWith("hi"))
                {
                    systemPrompt += "\nIMPORTANT: You must write the response strictly in Hindi language (हिंदी में उत्तर दें).";
                }
            }

            try
            {
                if (string.IsNullOrEmpty(apiKey) || apiKey == "YOUR_GEMINI_API_KEY_HERE" || apiKey.Length < 10)
                {
                    throw new Exception("Gemini API key is not configured.");
                }

                string url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={apiKey}";
                var requestBody = new
                {
                    contents = new[] { new { parts = new[] { new { text = systemPrompt } } } }
                };

                var response = await _httpClient.PostAsJsonAsync(url, requestBody);
                if (!response.IsSuccessStatusCode)
                {
                    throw new Exception($"Gemini request failed: {response.StatusCode}");
                }

                var jsonNode = await response.Content.ReadFromJsonAsync<JsonNode>();
                var answerText = jsonNode?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.ToString();

                if (string.IsNullOrEmpty(answerText)) throw new Exception("Empty response from AI.");

                var historyNode = new AIChatHistory
                {
                    UserId = request.UserId,
                    Question = request.Question,
                    Answer = answerText,
                    Location = request.Location,
                    CreatedAt = DateTime.UtcNow
                };
                _context.AIChatHistories.Add(historyNode);
                await _context.SaveChangesAsync();

                return Ok(new { answer = answerText });
            }
            catch (Exception ex)
            {
                Console.WriteLine("Krishi Mitra chat fell back to local advisor: " + ex.Message);
                
                string fallbackAnswer = "";
                var cleanLang = (request.Lang ?? "").Trim().ToLower();
                
                if (cleanLang.StartsWith("mr"))
                {
                    fallbackAnswer = $"**कृषी मित्र सल्लागार (स्थानिक बॅकअप):**\n\nतुमच्या प्रश्नासाठी धन्यवाद: \"{request.Question}\".\n\nसध्याच्या हवामानानुसार (ताशी {request.WeatherInfo}) आणि मातीची गुणवत्ता ({request.SoilInfo}), आम्ही सुचवतो:\n1. योग्य पाणी व्यवस्थापन करा आणि खतांचा वेळेवर वापर करा.\n2. बाजारातील चालू भाव पाहण्यासाठी जवळच्या बाजारपेठेशी संपर्क साधा.\n3. प्रधानमंत्री कृषी सन्मान योजना किंवा इतर योजनांच्या लाभासाठी नोंदणी तपासा.\n\nअधिक माहितीसाठी जवळच्या कृषी सहाय्यक अधिकाऱ्याशी संपर्क साधा.";
                }
                else if (cleanLang.StartsWith("hi"))
                {
                    fallbackAnswer = $"**कृषि मित्र सलाहकार (स्थानीय बैकअप):**\n\nआपके प्रश्न के लिए धन्यवाद: \"{request.Question}\".\n\nवर्तमान मौसम (विवरण: {request.WeatherInfo}) और मिट्टी के प्रकार ({request.SoilInfo}) के आधार पर:\n1. उचित जल निकासी और जैविक खादों का संतुलित उपयोग करें।\n2. मंडी के वर्तमान भावों के लिए कृषि मंडी अपडेट्स देखते रहें।\n3. सरकारी योजनाओं (जैसे पीएम-किसान) के पात्रता नियमों की जांच करें।\n\nअधिक मार्गदर्शन के लिए अपने स्थानीय कृषि विस्तार अधिकारी से संपर्क करें।";
                }
                else
                {
                    fallbackAnswer = $"**Krishi Mitra Advisor (Local Backup):**\n\nThank you for your question: \"{request.Question}\".\n\nBased on your location ({request.Location}), weather ({request.WeatherInfo}), and soil profile ({request.SoilInfo}), here are the recommended practices:\n1. Optimize irrigation schedules and apply fertilizers based on soil test parameters.\n2. Keep checking the Mandi dashboard for latest crop prices (current averages modal ₹4,500/q).\n3. Consult state agri-schemes for subsidies on seed purchases and micro-irrigation equipment.\n\nFor personalized farm visits, contact your block agricultural development officer.";
                }

                var historyNode = new AIChatHistory
                {
                    UserId = request.UserId,
                    Question = request.Question,
                    Answer = fallbackAnswer,
                    Location = request.Location,
                    CreatedAt = DateTime.UtcNow
                };
                _context.AIChatHistories.Add(historyNode);
                await _context.SaveChangesAsync();

                return Ok(new { answer = fallbackAnswer });
            }
        }
    }
}
