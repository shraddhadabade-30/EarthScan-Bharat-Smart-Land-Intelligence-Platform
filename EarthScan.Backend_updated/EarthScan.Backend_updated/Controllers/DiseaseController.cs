using System;
using System.IO;
using System.Threading.Tasks;
using EarthScan.Backend.Data;
using EarthScan.Backend.Models;
using EarthScan.Backend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace EarthScan.Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DiseaseController : ControllerBase
    {
        private readonly EarthScanDbContext _context;
        private readonly GeminiService _geminiService;

        public DiseaseController(EarthScanDbContext context, GeminiService geminiService)
        {
            _context = context;
            _geminiService = geminiService;
        }

        [HttpPost("detect")]
        public async Task<IActionResult> DetectDisease([FromForm] IFormFile file, [FromForm] int userId, [FromForm] string cropCategory = "General", [FromForm] string? lang = "en")
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "No leaf/crop image file uploaded." });
            }

            try
            {
                string? queryLang = Request.Query.ContainsKey("lang") ? Request.Query["lang"].ToString() : null;
                string? activeLang = !string.IsNullOrEmpty(queryLang) ? queryLang : lang;

                byte[] fileBytes;
                using (var ms = new MemoryStream())
                {
                    await file.CopyToAsync(ms);
                    fileBytes = ms.ToArray();
                }
                string base64Image = Convert.ToBase64String(fileBytes);

                string targetLang = "English";
                string langInstruction = "Return all values in English language.";
                if (!string.IsNullOrEmpty(activeLang))
                {
                    var cleanLang = activeLang.Trim().ToLower();
                    if (cleanLang.StartsWith("mr"))
                    {
                        targetLang = "Marathi";
                        langInstruction = "CRITICAL: You MUST write every single word of the response (DetectedCrop, DiseaseName, Cause, Treatment, FertilizerSuggestion, PreventiveMeasures) strictly in Marathi language using Devanagari script. Transliterate English names of chemicals (like Mancozeb as मॅन्कोझेब, Chlorothalonil as क्लोरोथॅलोनिल, Copper Oxychloride as कॉपर ऑक्सीक्लोराइड, etc.) into Devanagari script. Absolutely no English alphabets or English sentences are allowed in the text fields.";
                    }
                    else if (cleanLang.StartsWith("hi"))
                    {
                        targetLang = "Hindi";
                        langInstruction = "CRITICAL: You MUST write every single word of the response (DetectedCrop, DiseaseName, Cause, Treatment, FertilizerSuggestion, PreventiveMeasures) strictly in Hindi language using Devanagari script. Transliterate English names of chemicals into Devanagari script. Absolutely no English alphabets or English sentences are allowed in the text fields.";
                    }
                }

                string prompt = $@"Analyze this crop leaf image.
The user claims this is a '{cropCategory}' crop. 
First, identify the actual crop in the image. If the user's claim ('{cropCategory}') does not match the actual crop in the image (and the claim is not just 'General'), set 'IsMismatch' to true.
Then, identify any plant disease or deficiency.
Target Language: {targetLang}.
{langInstruction}

Return strictly a valid JSON object matching this schema exactly without markdown formatting:
{{
  ""DetectedCrop"": ""string (in {targetLang})"",
  ""IsMismatch"": boolean,
  ""DiseaseName"": ""string (in {targetLang})"",
  ""Cause"": ""string (in {targetLang})"",
  ""Treatment"": ""string (in {targetLang})"",
  ""FertilizerSuggestion"": ""string (in {targetLang})"",
  ""PreventiveMeasures"": ""string (in {targetLang})""
}}";

                var extracted = await _geminiService.GenerateContentAsync(prompt, file.ContentType, base64Image);

                if (extracted == null)
                {
                    return StatusCode(500, new { message = "Failed to parse AI JSON response." });
                }

                bool isMismatch = false;
                if (extracted["IsMismatch"] != null)
                {
                    isMismatch = extracted["IsMismatch"].GetValue<bool>();
                }

                string detectedCrop = extracted["DetectedCrop"]?.ToString() ?? "Unknown";

                if (isMismatch)
                {
                    return BadRequest(new { message = $"Crop mismatch detected. The image appears to be '{detectedCrop}', not '{cropCategory}'." });
                }

                string diseaseName = extracted["DiseaseName"]?.ToString() ?? "Unknown";
                string cause = extracted["Cause"]?.ToString() ?? "N/A";
                string treatment = extracted["Treatment"]?.ToString() ?? "N/A";
                string fertilizer = extracted["FertilizerSuggestion"]?.ToString() ?? "N/A";
                string preventive = extracted["PreventiveMeasures"]?.ToString() ?? "N/A";

                var prediction = new DiseasePrediction
                {
                    UserId = userId,
                    ImagePath = file.FileName,
                    DiseaseName = diseaseName,
                    Confidence = 95.0,
                    Symptoms = $"Cause: {cause}. Fertilizer: {fertilizer}",
                    OrganicTreatment = treatment,
                    ChemicalTreatment = preventive,
                    AgricultureOffice = "State Department of Agriculture",
                    CreatedAt = DateTime.UtcNow
                };

                _context.DiseasePredictions.Add(prediction);
                await _context.SaveChangesAsync();

                return Ok(extracted);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Gemini API request failed: {ex.Message}" });
            }
        }
    }
}