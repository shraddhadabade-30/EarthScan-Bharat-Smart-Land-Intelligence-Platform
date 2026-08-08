using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace EarthScan.Backend.Services
{
    public class GeminiService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public GeminiService(HttpClient httpClient, IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        public async Task<JsonObject?> GenerateContentAsync(string prompt, string? mimeType = null, string? base64Data = null)
        {
            string apiKey = _configuration["ApiKeys:Gemini"];
            if (string.IsNullOrEmpty(apiKey))
            {
                throw new InvalidOperationException("Gemini API key is missing from configuration.");
            }
            
            // No prefix validation here, allowing keys like 'AQ.'

            string model = _configuration["Gemini:Model"] ?? "gemini-flash-latest";
            string url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

            object requestBody;

            if (!string.IsNullOrEmpty(base64Data) && !string.IsNullOrEmpty(mimeType))
            {
                requestBody = new
                {
                    contents = new[]
                    {
                        new
                        {
                            parts = new object[]
                            {
                                new { text = prompt },
                                new { inlineData = new { mimeType = mimeType, data = base64Data } }
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
                                new { text = prompt }
                            }
                        }
                    },
                    generationConfig = new { responseMimeType = "application/json" }
                };
            }

            var response = await _httpClient.PostAsJsonAsync(url, requestBody);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorDetails = await response.Content.ReadAsStringAsync();
                throw new HttpRequestException($"Gemini API request failed. Status: {response.StatusCode}. Details: {errorDetails}");
            }

            var jsonNode = await response.Content.ReadFromJsonAsync<JsonNode>();
            var jsonText = jsonNode?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.ToString();

            if (string.IsNullOrEmpty(jsonText))
            {
                throw new Exception("Received empty response from Gemini API.");
            }

            jsonText = jsonText.Replace("```json", "").Replace("```", "").Trim();
            var extracted = JsonSerializer.Deserialize<JsonObject>(jsonText);

            return extracted;
        }
    }
}
