using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using EarthScan.Backend.Data;
using EarthScan.Backend.Models;
using EarthScan.Backend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace EarthScan.Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class LandsController : ControllerBase
    {
        private readonly EarthScanDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;
        private readonly GeminiService _geminiService;

        public LandsController(EarthScanDbContext context, IConfiguration configuration, GeminiService geminiService)
        {
            _context = context;
            _configuration = configuration;
            _httpClient = new HttpClient();
            _geminiService = geminiService;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Land>>> GetLands()
        {
            return await _context.Lands
                .Where(l => l.ImagePath != null && l.ImagePath.Trim() != "")
                .Include(l => l.Owner)
                .ToListAsync();
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<Land>> GetLand(int id)
        {
            var land = await _context.Lands
                .Include(l => l.Owner)
                .FirstOrDefaultAsync(l => l.Id == id);
            if (land == null) return NotFound(new { message = "Land record not found." });
            return land;
        }

        public class SellLandRequest
        {
            public int OwnerId { get; set; }
            public string Title { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public string Location { get; set; } = string.Empty;
            public decimal Price { get; set; }
            public string ContactNumber { get; set; } = string.Empty;
            public double AreaSize { get; set; }
            public string SoilType { get; set; } = string.Empty;
            public double GroundwaterLevelDepth { get; set; }
            public double Latitude { get; set; }
            public double Longitude { get; set; }
            public IFormFile? Photo { get; set; }
        }

        [HttpPost("sell")]
        public async Task<IActionResult> SellLand([FromForm] SellLandRequest request)
        {
            if (request == null) return BadRequest("Invalid land details.");

            string imagePath = string.Empty;

            if (request.Photo != null && request.Photo.Length > 0)
            {
                var uploadsFolder = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "lands");
                if (!Directory.Exists(uploadsFolder)) Directory.CreateDirectory(uploadsFolder);

                var uniqueFileName = Guid.NewGuid().ToString() + "_" + request.Photo.FileName;
                var filePath = Path.Combine(uploadsFolder, uniqueFileName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await request.Photo.CopyToAsync(stream);
                }
                imagePath = $"/uploads/lands/{uniqueFileName}";
            }

            var land = new Land
            {
                OwnerId = request.OwnerId,
                Title = request.Title,
                Description = request.Description,
                Location = request.Location,
                Price = request.Price,
                ContactNumber = request.ContactNumber,
                SizeInAcres = request.AreaSize,
                SoilType = request.SoilType,
                GroundwaterLevelDepth = request.GroundwaterLevelDepth,
                ImagePath = imagePath,
                Latitude = request.Latitude,
                Longitude = request.Longitude,
                LandIntelligenceScore = CalculateDynamicIntelligenceScore(request.SoilType, request.GroundwaterLevelDepth),
                BorewellSuccessProbability = CalculateDynamicBorewellProbability(request.SoilType, request.GroundwaterLevelDepth),
                CreatedAt = DateTime.UtcNow
            };

            _context.Lands.Add(land);
            await _context.SaveChangesAsync();

            return CreatedAtAction("GetLand", new { id = land.Id }, new { message = "Land listed for sale successfully.", land });
        }

        [HttpGet("{id}/analyze")]
        public async Task<IActionResult> GetInvestmentAnalysis(int id, [FromQuery] string crop)
        {
            if (string.IsNullOrWhiteSpace(crop)) return BadRequest(new { message = "Crop name is required for investment analysis." });

            var land = await _context.Lands.FindAsync(id);
            if (land == null) return NotFound(new { message = "Land record not found." });

            string apiKey = _configuration["ApiKeys:Gemini"];
            if (string.IsNullOrEmpty(apiKey)) return StatusCode(500, new { message = "Gemini API key is not configured." });

            string prompt = $@"You are an agricultural investment analyst. Analyze the investment viability of cultivating '{crop}' on land with:
- Soil Type: {land.SoilType}
- Groundwater Depth: {land.GroundwaterLevelDepth} meters

Return strictly a valid JSON object matching this schema exactly without markdown formatting:
{{
  ""SoilSuitability"": ""string"",
  ""WaterAvailability"": ""string"",
  ""RainfallCompatibility"": ""string"",
  ""ExpectedProductivity"": ""string"",
  ""EstimatedProfitLoss"": ""string""
}}";

            try
            {
                string url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={apiKey}";
                var requestBody = new
                {
                    contents = new[] { new { parts = new[] { new { text = prompt } } } },
                    generationConfig = new { responseMimeType = "application/json" }
                };

                var response = await _httpClient.PostAsJsonAsync(url, requestBody);
                if (!response.IsSuccessStatusCode) return StatusCode((int)response.StatusCode, new { message = "AI analysis request failed." });

                var jsonNode = await response.Content.ReadFromJsonAsync<JsonNode>();
                var jsonText = jsonNode?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.ToString();

                if (string.IsNullOrEmpty(jsonText)) return StatusCode(500, new { message = "Received empty analysis from AI." });

                jsonText = jsonText.Replace("```json", "").Replace("```", "").Trim();
                var extracted = JsonSerializer.Deserialize<JsonObject>(jsonText);

                return Ok(extracted);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        private double CalculateDynamicIntelligenceScore(string soilType, double groundwaterDepth)
        {
            double score = 100.0; 
            score -= (groundwaterDepth * 0.3);

            if (!string.IsNullOrEmpty(soilType))
            {
                if (soilType.Contains("Alluvial", StringComparison.OrdinalIgnoreCase)) score += 15;
                else if (soilType.Contains("Black", StringComparison.OrdinalIgnoreCase)) score += 10;
                else if (soilType.Contains("Red", StringComparison.OrdinalIgnoreCase)) score += 5;
                else if (soilType.Contains("Sandy", StringComparison.OrdinalIgnoreCase)) score -= 10;
            }

            return Math.Round(Math.Clamp(score, 10.0, 98.0), 2);
        }

        private double CalculateDynamicBorewellProbability(string soilType, double groundwaterDepth)
        {
            double probability = 100.0;
            probability -= (groundwaterDepth * 0.45);

            if (!string.IsNullOrEmpty(soilType))
            {
                if (soilType.Contains("Basalt", StringComparison.OrdinalIgnoreCase) || soilType.Contains("Hard Rock", StringComparison.OrdinalIgnoreCase)) 
                    probability -= 20.0; 
                else if (soilType.Contains("Alluvial", StringComparison.OrdinalIgnoreCase)) 
                    probability += 10.0; 
            }

            return Math.Round(Math.Clamp(probability, 15.0, 95.0), 2);
        }

        [HttpPost("satbara/upload")]
        public async Task<IActionResult> UploadSatbaraPdf([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "No file uploaded." });
            }

            try
            {
                byte[] fileBytes;
                using (var ms = new MemoryStream())
                {
                    await file.CopyToAsync(ms);
                    fileBytes = ms.ToArray();
                }
                string base64Data = Convert.ToBase64String(fileBytes);

                string prompt = @"You are a land records parsing assistant. Extract information from this 7/12 (Satbara) document.
Return strictly a valid JSON object matching this schema exactly without markdown formatting:
{
  ""ownerName"": ""Exact primary owner name found in document"",
  ""surveyNo"": ""Survey/Gat number"",
  ""totalArea"": ""Total land area (Hectares/Acres)"",
  ""cultivableArea"": ""Cultivable area (Hectares/Acres)"",
  ""potkharaba"": ""Uncultivable area / Potkharaba (Hectares/Acres)"",
  ""village"": ""Village name"",
  ""isAuthentic"": true
}";

                var extracted = await _geminiService.GenerateContentAsync(prompt, file.ContentType, base64Data);

                if (extracted == null)
                {
                    return StatusCode(500, new { message = "Failed to parse AI JSON response." });
                }

                return Ok(extracted);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"AI PDF extraction failed: {ex.Message}" });
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteLand(int id)
        {
            var land = await _context.Lands.FindAsync(id);
            if (land == null)
            {
                return NotFound(new { message = "Land not found." });
            }

            _context.Lands.Remove(land);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Land deleted successfully." });
        }
    }
}
