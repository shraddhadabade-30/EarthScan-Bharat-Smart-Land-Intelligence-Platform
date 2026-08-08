using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using EarthScan.Backend.Data;
using EarthScan.Backend.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using UglyToad.PdfPig;

namespace EarthScan.Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SoilController : ControllerBase
    {
        private readonly EarthScanDbContext _context;
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public SoilController(EarthScanDbContext context, IConfiguration configuration)
        {
            _context = context;
            _httpClient = new HttpClient();
            _configuration = configuration;
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadSoilReport([FromForm] IFormFile file, [FromQuery] int userId)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "No soil report PDF file uploaded." });
            }

            // 1. Secure file validation
            var extension = System.IO.Path.GetExtension(file.FileName).ToLowerInvariant();
            var allowedExtensions = new[] { ".pdf", ".jpg", ".jpeg", ".png", ".webp" };
            if (!allowedExtensions.Contains(extension))
            {
                return BadRequest(new { message = "Invalid file type. Only PDF or image reports are allowed." });
            }

            if (file.Length > 5 * 1024 * 1024)
            {
                return BadRequest(new { message = "Report file size exceeds the maximum limit of 5 MB." });
            }

            try
            {
                // 2. Read PDF text using PdfPig or dummy text for images when API fails
                string pdfText = "";
                if (extension == ".pdf")
                {
                    try
                    {
                        using (var stream = file.OpenReadStream())
                        {
                            using (var pdf = PdfDocument.Open(stream))
                            {
                                foreach (var page in pdf.GetPages())
                                {
                                    pdfText += page.Text + "\n";
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("PdfPig failed: " + ex.Message);
                    }
                }
                else
                {
                    // If image is provided, we need OCR. If that failed or wasn't processed, we cannot provide accurate results.
                    return BadRequest(new { message = "Could not extract text from the image. Please try uploading a clearer image or a PDF." });
                }

                bool fallbackToDirectPdf = string.IsNullOrWhiteSpace(pdfText) || pdfText.Trim().Length < 50;

                // 3. Parse text to extract NPK / pH using Gemini API
                double n = 0, p = 0, k = 0, ph = 0;
                string soilType = "Black Soil";
                string soilHealthStatus = "Moderate soil health with standard NPK balance.";
                string nutrientDeficiency = "No severe deficiencies detected.";
                var suitableCropsList = new List<string> { "Cotton", "Soybean", "Wheat" };
                string fertilizerRecommendations = "Apply organic compost and balanced NPK (19:19:19) at regular sowing periods.";
                string waterManagementAdvice = "Provide sprinkler irrigation based on dry spells. Avoid waterlogging in low-lying sections.";
                string relevantGovernmentSchemes = "Soil Health Card Scheme, PM Krishi Sinchayee Yojana.";
                bool parsedViaAi = false;

                string apiKey = _configuration["ApiKeys:Gemini"] 
                    ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY") 
                    ?? string.Empty;

                if (!string.IsNullOrEmpty(apiKey) && apiKey != "YOUR_GEMINI_API_KEY_HERE" && apiKey.Length >= 20)
                {
                    try
                    {
                        string prompt = @"Analyze the Soil Health Card/Report PDF document.
Extract Nitrogen (N), Phosphorus (P), Potassium (K), and pH levels. Also generate customized recommendations based on these values.
Return strictly a valid JSON object matching this schema exactly without markdown formatting:
{
  ""Nitrogen"": 0.0,
  ""Phosphorus"": 0.0,
  ""Potassium"": 0.0,
  ""Ph"": 0.0,
  ""SoilType"": ""Black Cotton Soil"",
  ""SoilHealthStatus"": ""Brief overview of soil health status based on values"",
  ""NutrientDeficiency"": ""Detailed nutrient deficiency analysis (such as deficient elements)"",
  ""SuitableCrops"": [""Crop1"", ""Crop2"", ""Crop3""],
  ""FertilizerRecommendations"": ""Recommended fertilizer usage and application times"",
  ""WaterManagementAdvice"": ""Optimal irrigation tips (e.g. drip spacing, drainage guidance)"",
  ""RelevantGovernmentSchemes"": ""Government schemes relevant to these soil conditions (e.g. Micro-Irrigation subsidy, Soil Card benefits)""
}
If N/P/K is given in categories (low/medium/high), map: Low -> 30, Pattern/Medium -> 60, High -> 120.";

                        // Use configurable model version
                        string model = _configuration["Gemini:Model"] ?? "gemini-flash-latest";
                        string url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
                        
                        object requestBody;
                        if (fallbackToDirectPdf)
                        {
                            byte[] pdfBytes;
                            using (var memoryStream = new MemoryStream())
                            {
                                await file.CopyToAsync(memoryStream);
                                pdfBytes = memoryStream.ToArray();
                            }
                            string base64Pdf = Convert.ToBase64String(pdfBytes);

                            requestBody = new
                            {
                                contents = new[]
                                {
                                    new
                                    {
                                        parts = new object[]
                                        {
                                            new { text = prompt },
                                            new { inlineData = new { mimeType = "application/pdf", data = base64Pdf } }
                                        }
                                    }
                                },
                                generationConfig = new { responseMimeType = "application/json" }
                            };
                        }
                        else
                        {
                            requestBody = new
                            {
                                contents = new[]
                                {
                                    new
                                    {
                                        parts = new object[]
                                        {
                                            new { text = prompt + "\n\nExtracted Text:\n" + pdfText }
                                        }
                                    }
                                },
                                generationConfig = new { responseMimeType = "application/json" }
                            };
                        }

                        var response = await _httpClient.PostAsJsonAsync(url, requestBody);
                        if (response.IsSuccessStatusCode)
                        {
                            var jsonNode = await response.Content.ReadFromJsonAsync<JsonNode>();
                            var jsonText = jsonNode?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.ToString();
                            if (!string.IsNullOrEmpty(jsonText))
                            {
                                jsonText = ExtractJson(jsonText);
                                var extracted = JsonSerializer.Deserialize<JsonObject>(jsonText);
                                if (extracted != null)
                                {
                                    Func<string, double, double> getVal = (key, def) => {
                                        if (extracted.TryGetPropertyValue(key, out var node) && node != null) {
                                            try { return node.GetValue<double>(); }
                                            catch { if (double.TryParse(node.ToString(), out double v)) return v; }
                                        }
                                        if (extracted.TryGetPropertyValue(key.ToLower(), out var nodeLower) && nodeLower != null) {
                                            try { return nodeLower.GetValue<double>(); }
                                            catch { if (double.TryParse(nodeLower.ToString(), out double v)) return v; }
                                        }
                                        return def;
                                    };

                                    n = getVal("Nitrogen", 0);
                                    p = getVal("Phosphorus", 0);
                                    k = getVal("Potassium", 0);
                                    ph = getVal("Ph", 0);

                                    if (extracted.TryGetPropertyValue("SoilType", out var stNode) && stNode != null) soilType = stNode.ToString();
                                    else if (extracted.TryGetPropertyValue("soiltype", out var stNodeL) && stNodeL != null) soilType = stNodeL.ToString();

                                    if (extracted.TryGetPropertyValue("SoilHealthStatus", out var shsNode) && shsNode != null) soilHealthStatus = shsNode.ToString();
                                    if (extracted.TryGetPropertyValue("NutrientDeficiency", out var ndNode) && ndNode != null) nutrientDeficiency = ndNode.ToString();
                                    
                                    if (extracted.TryGetPropertyValue("SuitableCrops", out var scNode) && scNode != null)
                                    {
                                        try
                                        {
                                            var cropsArray = scNode.AsArray();
                                            suitableCropsList = cropsArray.Select(c => c?.ToString() ?? "").Where(s => !string.IsNullOrEmpty(s)).ToList();
                                        }
                                        catch {
                                            var strCrops = scNode.ToString();
                                            if (!string.IsNullOrEmpty(strCrops)) {
                                                suitableCropsList = strCrops.Split(',').Select(c => c.Trim()).ToList();
                                            }
                                        }
                                    }

                                    if (extracted.TryGetPropertyValue("FertilizerRecommendations", out var frNode) && frNode != null) fertilizerRecommendations = frNode.ToString();
                                    if (extracted.TryGetPropertyValue("WaterManagementAdvice", out var wmaNode) && wmaNode != null) waterManagementAdvice = wmaNode.ToString();
                                    if (extracted.TryGetPropertyValue("RelevantGovernmentSchemes", out var rgsNode) && rgsNode != null) relevantGovernmentSchemes = rgsNode.ToString();

                                    parsedViaAi = true;
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("Gemini PDF parsing failed: " + ex.Message);
                    }
                }

                if (!parsedViaAi)
                {
                    // Fallback Regex
                    var phMatch = Regex.Match(pdfText, @"(?:ph|reaction)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)", RegexOptions.IgnoreCase);
                    if (phMatch.Success) double.TryParse(phMatch.Groups[1].Value, out ph);

                    var nMatch = Regex.Match(pdfText, @"(?:nitrogen|N)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)", RegexOptions.IgnoreCase);
                    if (nMatch.Success) double.TryParse(nMatch.Groups[1].Value, out n);

                    var pMatch = Regex.Match(pdfText, @"(?:phosphorus|phosphate|P)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)", RegexOptions.IgnoreCase);
                    if (pMatch.Success) double.TryParse(pMatch.Groups[1].Value, out p);

                    var kMatch = Regex.Match(pdfText, @"(?:potassium|potash|K)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)", RegexOptions.IgnoreCase);
                    if (kMatch.Success) double.TryParse(kMatch.Groups[1].Value, out k);

                    if (pdfText.ToLower().Contains("red")) soilType = "Red Soil";
                    else if (pdfText.ToLower().Contains("alluvial")) soilType = "Alluvial Soil";
                    else if (pdfText.ToLower().Contains("sandy")) soilType = "Sandy Loam Soil";

                    // Dynamically generate fallback recommendations based on parameters
                    if (ph > 0 && ph < 6.0)
                    {
                        soilHealthStatus = "Acidic soil health condition.";
                        nutrientDeficiency = "Lime conditioning needed. Phosphorus availability is restricted.";
                        suitableCropsList = new List<string> { "Rice", "Potato", "Tea" };
                        fertilizerRecommendations = "Apply Agricultural Lime (Calcium Carbonate) to raise pH. Limit acidic fertilizers like Ammonium Sulfate.";
                        waterManagementAdvice = "Ensure adequate watering but prevent stagnant acid build-up through active drainage.";
                    }
                    else if (ph > 8.0)
                    {
                        soilHealthStatus = "Alkaline soil health condition.";
                        nutrientDeficiency = "Zinc and Iron availability is critically low.";
                        suitableCropsList = new List<string> { "Wheat", "Cotton", "Barley" };
                        fertilizerRecommendations = "Apply Gypsum to reduce alkalinity. Use organic compost and sulfur-coated fertilizers.";
                        waterManagementAdvice = "Adopt drip irrigation to prevent sodium accumulation. Schedule deep leaching water runs.";
                    }
                    else
                    {
                        soilHealthStatus = "Optimal neutral soil pH.";
                        nutrientDeficiency = n < 50 ? "Low nitrogen levels." : "Balanced nutrient levels.";
                        suitableCropsList = new List<string> { "Cotton", "Soybean", "Gram" };
                        fertilizerRecommendations = n < 50 ? "Apply Urea (45% N) top-dressing during crop vegetative stage." : "Use standard NPK 19:19:19 balanced fertilizer.";
                        waterManagementAdvice = "Regular irrigation cycles. Black cotton soils require less frequent but deeper watering.";
                    }
                }

                // 4. Mark invalid/corrupted records if all values are missing/<=0
                bool isValid = true;
                if (n <= 0 && p <= 0 && k <= 0 && ph <= 0)
                {
                    return BadRequest(new { message = "Could not extract valid soil data from the report. Please ensure the document is clear and contains NPK/pH values." });
                }

                // 6. Save to SoilReports
                var report = new SoilReport
                {
                    UserId = userId,
                    FileName = file.FileName,
                    Nitrogen = n,
                    Phosphorus = p,
                    Potassium = k,
                    Ph = ph,
                    SoilType = soilType,
                    IsValid = isValid,
                    CreatedAt = DateTime.UtcNow
                };

                _context.SoilReports.Add(report);
                await _context.SaveChangesAsync();

                return Ok(new
                {
                    message = isValid ? "Soil report uploaded and parsed successfully." : "Soil report uploaded, but was marked invalid because no readable soil data was found.",
                    nitrogen = n,
                    phosphorus = p,
                    potassium = k,
                    ph = ph,
                    soilType = soilType,
                    isValid = isValid,
                    parsedViaAi = parsedViaAi,
                    soilHealthStatus = soilHealthStatus,
                    nutrientDeficiency = nutrientDeficiency,
                    suitableCrops = suitableCropsList,
                    fertilizerRecommendations = fertilizerRecommendations,
                    waterManagementAdvice = waterManagementAdvice,
                    relevantGovernmentSchemes = relevantGovernmentSchemes
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Internal server error: {ex.Message}" });
            }
        }

        public class RecommendationRequest
        {
            public double Nitrogen { get; set; }
            public double Phosphorus { get; set; }
            public double Potassium { get; set; }
            public double Ph { get; set; }
            public double Rainfall { get; set; }
        }

        [HttpPost("recommend")]
        public async Task<IActionResult> RecommendCrops([FromBody] RecommendationRequest request, [FromQuery] string? lang)
        {
            if (request == null) return BadRequest("Soil parameters are required.");

            string apiKey = _configuration["ApiKeys:Gemini"] 
                ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY") 
                ?? string.Empty;

            bool useFallback = false;
            string apiResponseError = string.Empty;

            if (string.IsNullOrEmpty(apiKey) || apiKey == "YOUR_GEMINI_API_KEY_HERE" || apiKey.Length < 20)
            {
                useFallback = true;
            }

            string languageInstruction = "";
            if (!string.IsNullOrEmpty(lang))
            {
                var cleanLang = lang.Trim().ToLower();
                if (cleanLang.StartsWith("hi"))
                {
                    languageInstruction = "\nIMPORTANT: All values in the JSON fields (crop, desc, fert, dose) MUST be written in clean Hindi language (हिंदी).";
                }
                else if (cleanLang.StartsWith("mr"))
                {
                    languageInstruction = "\nIMPORTANT: All values in the JSON fields (crop, desc, fert, dose) MUST be written in clean Marathi language (मराठी).";
                }
            }

            string prompt = $@"Analyze soil parameters for crop recommendation:
- Nitrogen (N): {request.Nitrogen} mg/kg
- Phosphorus (P): {request.Phosphorus} mg/kg
- Potassium (K): {request.Potassium} mg/kg
- pH Level: {request.Ph}
- Average Annual Rainfall: {request.Rainfall} mm

Recommend the top 2 suitable crops for cultivation. 
Return strictly a valid JSON array matching this schema exactly without markdown formatting:
[
  {{
    ""crop"": ""Crop Name"",
    ""match"": 95,
    ""type"": ""Recommended"",
    ""bg"": ""success"",
    ""desc"": ""detailed description why it is suitable..."",
    ""fert"": ""fertilizer recommendation..."",
    ""dose"": ""recommended dosage...""
  }},
  {{
    ""crop"": ""Alternative Crop Name"",
    ""match"": 82,
    ""type"": ""Alternative"",
    ""bg"": ""primary"",
    ""desc"": ""detailed description..."",
    ""fert"": ""fertilizer recommendation..."",
    ""dose"": ""recommended dosage...""
  }}
]{languageInstruction}";

            if (!useFallback)
            {
                try
                {
                    string model = _configuration["Gemini:Model"] ?? "gemini-flash-latest";
                    string url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
                    var requestBody = new
                    {
                        contents = new[] { new { parts = new[] { new { text = prompt } } } },
                        generationConfig = new { responseMimeType = "application/json" }
                    };

                    var response = await _httpClient.PostAsJsonAsync(url, requestBody);
                    if (response.IsSuccessStatusCode)
                    {
                        var jsonNode = await response.Content.ReadFromJsonAsync<JsonNode>();
                        var jsonText = jsonNode?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.ToString();
                        
                        if (!string.IsNullOrEmpty(jsonText))
                        {
                            jsonText = ExtractJson(jsonText);
                            var array = JsonSerializer.Deserialize<JsonArray>(jsonText);
                            if (array != null)
                            {
                                return Ok(array);
                            }
                        }
                    }
                    else
                    {
                        apiResponseError = await response.Content.ReadAsStringAsync();
                        Console.WriteLine($"Gemini recommend API call failed, falling back: {apiResponseError}");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Gemini recommend API threw exception, using local rule-based fallback: " + ex.Message);
                }
            }

            // Fallback to Rule-Based Recommendations
            var fallbackRecommendations = GetRuleBasedRecommendations(request, lang);
            return Ok(fallbackRecommendations);
        }

        private static object GetRuleBasedRecommendations(RecommendationRequest request, string? lang)
        {
            var cleanLang = lang?.Trim()?.ToLower() ?? "";
            bool isHindi = cleanLang.StartsWith("hi");
            bool isMarathi = cleanLang.StartsWith("mr");

            // Crop choices
            string crop1 = "Cotton";
            string crop2 = "Soybean";
            string desc1 = "Suitable for medium-drained soils with balanced nutrients. Your NPK matches cotton requirements.";
            string desc2 = "Optimal for nitrogen-fixing legume growth in neutral soil profiles.";
            string fert1 = "Apply Urea (100 kg/ha) and Single Super Phosphate (150 kg/ha).";
            string fert2 = "Apply Muriate of Potash (MOP) (50 kg/ha) and Gypsum.";
            string dose1 = "Split urea dose: 50% at sowing, 50% at flowering.";
            string dose2 = "Basal application of NPK during soil preparation.";

            if (request.Ph < 6.0)
            {
                crop1 = "Rice (Paddy)";
                crop2 = "Potato";
                desc1 = "Thrives in acidic soil with good water retention.";
                desc2 = "Acidic soil is ideal for potato tubers to prevent scab disease.";
                fert1 = "Ammonium Sulfate (120 kg/ha) and Rock Phosphate.";
                fert2 = "Potassium Sulfate (150 kg/ha) and Organic Compost.";
                dose1 = "Apply in 3 split doses: early tillering, panicle initiation, and boot stage.";
                dose2 = "Apply during land bedding and secondary tilling.";
            }
            else if (request.Ph > 7.8)
            {
                crop1 = "Barley";
                crop2 = "Wheat";
                desc1 = "Highly tolerant to alkaline and saline soil conditions.";
                desc2 = "Suitable crop with moderate tolerance to high pH levels.";
                fert1 = "Apply Zinc Sulfate (25 kg/ha) and Ammonium Nitrate.";
                fert2 = "Apply Gypsum (500 kg/ha) before planting to balance pH.";
                dose1 = "Basal dose at sowing time.";
                dose2 = "Basal dressing + top dressing at first crown root initiation.";
            }
            else if (request.Rainfall > 1100)
            {
                crop1 = "Rice";
                crop2 = "Sugarcane";
                desc1 = "High rainfall ensures required water pooling for paddy fields.";
                desc2 = "Perennial grass requiring abundant watering and high nitrogen.";
                fert1 = "Urea and SSP.";
                fert2 = "Apply Nitrogen-rich NPK and biofertilizers.";
                dose1 = "Split application across growth stages.";
                dose2 = "Multiple doses over a 12-month period.";
            }

            if (isHindi)
            {
                if (crop1 == "Cotton") { crop1 = "कपास"; desc1 = "संतुलित पोषक तत्वों वाली मध्यम जल निकासी वाली मिट्टी के लिए उपयुक्त।"; fert1 = "यूरिया (100 किलोग्राम/हेक्टेयर) और सिंगल सुपर फास्फेट का उपयोग करें।"; dose1 = "बुवाई के समय 50% और फूल आने पर 50% यूरिया दें।"; }
                else if (crop1 == "Rice (Paddy)" || crop1 == "Rice") { crop1 = "धान (चावल)"; desc1 = "अच्छी जल धारण क्षमता वाली अम्लीय मिट्टी में फलता-फूलता है।"; fert1 = "अमोनियम सल्फेट और रॉक फॉस्फेट का प्रयोग करें।"; dose1 = "3 खुराक में दें: कल्ले निकलते समय, बाली बनते समय और बूट चरण में।"; }
                else if (crop1 == "Barley") { crop1 = "जौ"; desc1 = "क्षारीय और लवणीय मिट्टी की स्थिति के लिए अत्यधिक सहिष्णु।"; fert1 = "जिंक सल्फेट और अमोनियम नाइट्रेट डालें।"; dose1 = "बुवाई के समय मूल खुराक।"; }

                if (crop2 == "Soybean") { crop2 = "सोयाबीन"; desc2 = "तटस्थ मिट्टी प्रोफाइल में नाइट्रोजन-फिक्सिंग फलियों के विकास के लिए इष्टतम।"; fert2 = "म्यूरिएट ऑफ पोटाश (MOP) और जिप्सम डालें।"; dose2 = "मिट्टी की तैयारी के दौरान बुनियादी अनुप्रयोग।"; }
                else if (crop2 == "Potato") { crop2 = "आलू"; desc2 = "आलू के कंदों के लिए पपड़ी रोग से बचने के लिए अम्लीय मिट्टी आदर्श है।"; fert2 = "पोटेशियम सल्फेट और जैविक खाद।"; dose2 = "मिट्टी चढ़ाने के दौरान प्रयोग करें।"; }
                else if (crop2 == "Wheat") { crop2 = "गेहूं"; desc2 = "उच्च पीएच स्तरों के प्रति मध्यम सहिष्णुता वाला उपयुक्त अनाज।"; fert2 = "बुवाई से पहले जिप्सम (500 किग्रा/हेक्टेयर) डालें।"; dose2 = "पहली सिंचाई पर शीर्ष ड्रेसिंग।"; }
            }
            else if (isMarathi)
            {
                if (crop1 == "Cotton") { crop1 = "कापूस"; desc1 = "मध्यम निचरा असलेल्या आणि संतुलित पोषक घटक असलेल्या जमिनीसाठी योग्य. आपल्या जमिनीतील NPK कापसासाठी योग्य आहे."; fert1 = "युरिया (१०० किलो/हेक्टर) आणि सिंगल सुपर फॉस्फेट वापरा."; dose1 = "युरिया दोन टप्प्यात द्या: ५०% पेरणीच्या वेळी आणि ५०% फुलोऱ्याच्या वेळी."; }
                else if (crop1 == "Rice (Paddy)" || crop1 == "Rice") { crop1 = "भात (तांदूळ)"; desc1 = "पाणी धरून ठेवणाऱ्या आम्लधर्मी जमिनीत चांगले उत्पादन येते."; fert1 = "अमोनियम सल्फेट आणि रॉक फॉस्फेट वापरा."; dose1 = "३ टप्प्यात द्या: फुटवे येताना, लोंबी निघताना आणि बूट स्टेजला."; }
                else if (crop1 == "Barley") { crop1 = "जव (सत्तू)"; desc1 = "क्षारयुक्त आणि विम्लधर्मी जमिनीसाठी अत्यंत सहनशील पीक."; fert1 = "झिंक सल्फेट आणि अमोनियम नायट्रेट टाका."; dose1 = "पेरणीच्या वेळी मुख्य डोस द्या."; }

                if (crop2 == "Soybean") { crop2 = "सोयाबीन"; desc2 = "उदासीन जमिनीत नत्र स्थिर करणाऱ्या पिकांच्या वाढीसाठी उत्तम."; fert2 = "म्युरिएट ऑफ पोटॅश (MOP) आणि जिप्सम वापरा."; dose2 = "जमीन तयार करताना खतांचा वापर करा."; }
                else if (crop2 == "Potato") { crop2 = "बटाटा"; desc2 = "बटाट्यावरील तांबेरा रोग रोखण्यासाठी आम्लधर्मी जमीन उत्तम ठरते."; fert2 = "पोटॅशियम सल्फेट आणि सेंद्रिय खत."; dose2 = "माती लावणीच्या वेळी वापरा."; }
                else if (crop2 == "Wheat") { crop2 = "गहू"; desc2 = "जास्त पीएच पातळी असलेल्या जमिनीत चांगले येणारे पीक."; fert2 = "पेरणीपूर्वी जिप्सम (५०० किलो/हेक्टर) टाका."; dose2 = "पहिले पाणी देताना खताचा डोस द्या."; }
            }

            return new[]
            {
                new { crop = crop1, match = 92, type = "Recommended", bg = "success", desc = desc1, fert = fert1, dose = dose1 },
                new { crop = crop2, match = 80, type = "Alternative", bg = "primary", desc = desc2, fert = fert2, dose = dose2 }
            };
        }

        private static string ExtractJson(string input)
        {
            if (string.IsNullOrEmpty(input)) return string.Empty;
            int firstBrace = input.IndexOf('{');
            int firstBracket = input.IndexOf('[');
            
            int start = -1;
            int end = -1;
            
            if (firstBrace != -1 && (firstBracket == -1 || firstBrace < firstBracket))
            {
                start = firstBrace;
                end = input.LastIndexOf('}');
            }
            else if (firstBracket != -1)
            {
                start = firstBracket;
                end = input.LastIndexOf(']');
            }
            
            if (start != -1 && end != -1 && end > start)
            {
                return input.Substring(start, end - start + 1);
            }
            
            return input.Trim();
        }
    }
}
