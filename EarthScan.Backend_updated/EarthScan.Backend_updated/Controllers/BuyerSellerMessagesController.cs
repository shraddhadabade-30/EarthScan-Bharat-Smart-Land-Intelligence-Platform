using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace EarthScan.Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class BuyerSellerMessagesController : ControllerBase
    {
        private static readonly string FilePath = Path.Combine(Directory.GetCurrentDirectory(), "buyer_seller_messages.json");
        private static readonly object FileLock = new object();

        private List<BuyerSellerMessage> LoadMessages()
        {
            lock (FileLock)
            {
                if (!System.IO.File.Exists(FilePath))
                {
                    return new List<BuyerSellerMessage>();
                }
                try
                {
                    var json = System.IO.File.ReadAllText(FilePath);
                    return JsonSerializer.Deserialize<List<BuyerSellerMessage>>(json) ?? new List<BuyerSellerMessage>();
                }
                catch
                {
                    return new List<BuyerSellerMessage>();
                }
            }
        }

        private void SaveMessages(List<BuyerSellerMessage> messages)
        {
            lock (FileLock)
            {
                var json = JsonSerializer.Serialize(messages, new JsonSerializerOptions { WriteIndented = true });
                System.IO.File.WriteAllText(FilePath, json);
            }
        }

        // GET: api/buyersellermessages/byemail?email=user@example.com
        [HttpGet("byemail")]
        public ActionResult<IEnumerable<BuyerSellerMessage>> GetMessagesByEmail([FromQuery] string email)
        {
            if (string.IsNullOrWhiteSpace(email))
                return BadRequest("Email is required.");

            var all = LoadMessages();
            var filtered = all.Where(m => 
                m.BuyerEmail.Equals(email, StringComparison.OrdinalIgnoreCase) || 
                m.SellerEmail.Equals(email, StringComparison.OrdinalIgnoreCase)
            )
            .OrderBy(m => m.SentAt)
            .ToList();

            return Ok(filtered);
        }

        // POST: api/buyersellermessages
        [HttpPost]
        public IActionResult SendMessage([FromBody] SendBuyerSellerMessageRequest request)
        {
            if (request == null || 
                string.IsNullOrWhiteSpace(request.BuyerEmail) || 
                string.IsNullOrWhiteSpace(request.SellerEmail) || 
                string.IsNullOrWhiteSpace(request.MessageContent))
            {
                return BadRequest("Invalid message payload.");
            }

            var all = LoadMessages();
            var newId = all.Count > 0 ? all.Max(m => m.Id) + 1 : 1;

            var msg = new BuyerSellerMessage
            {
                Id = newId,
                LandId = request.LandId,
                LandTitle = request.LandTitle,
                BuyerEmail = request.BuyerEmail,
                BuyerName = request.BuyerName,
                SellerEmail = request.SellerEmail,
                SellerName = request.SellerName,
                MessageContent = request.MessageContent,
                SenderEmail = request.SenderEmail,
                SentAt = DateTime.UtcNow
            };

            all.Add(msg);
            SaveMessages(all);
            return Ok(msg);
        }

        // POST: api/buyersellermessages/upload
        [HttpPost("upload")]
        public async Task<IActionResult> UploadMessageAttachment([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("No file uploaded.");

            var uploadsFolder = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "messages");
            if (!Directory.Exists(uploadsFolder))
                Directory.CreateDirectory(uploadsFolder);

            var uniqueFileName = Guid.NewGuid().ToString() + "_" + file.FileName;
            var filePath = Path.Combine(uploadsFolder, uniqueFileName);

            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            var fileUrl = $"/uploads/messages/{uniqueFileName}";
            return Ok(new { url = fileUrl });
        }

        // DELETE: api/buyersellermessages/thread?landId=42&buyerEmail=sanika@gmail.com
        [HttpDelete("thread")]
        public IActionResult DeleteThread([FromQuery] int landId, [FromQuery] string buyerEmail)
        {
            if (string.IsNullOrWhiteSpace(buyerEmail))
                return BadRequest("Buyer email is required.");

            var all = LoadMessages();
            var kept = all.Where(m => 
                !(m.LandId == landId && m.BuyerEmail.Equals(buyerEmail, StringComparison.OrdinalIgnoreCase))
            ).ToList();

            if (kept.Count < all.Count)
            {
                SaveMessages(kept);
                return Ok(new { message = "Conversation thread deleted successfully." });
            }
            return NotFound("Conversation thread not found.");
        }
    }

    public class BuyerSellerMessage
    {
        public int Id { get; set; }
        public int LandId { get; set; }
        public string LandTitle { get; set; } = string.Empty;
        public string BuyerEmail { get; set; } = string.Empty;
        public string BuyerName { get; set; } = string.Empty;
        public string SellerEmail { get; set; } = string.Empty;
        public string SellerName { get; set; } = string.Empty;
        public string MessageContent { get; set; } = string.Empty;
        public string SenderEmail { get; set; } = string.Empty;
        public DateTime SentAt { get; set; }
    }

    public class SendBuyerSellerMessageRequest
    {
        public int LandId { get; set; }
        public string LandTitle { get; set; } = string.Empty;
        public string BuyerEmail { get; set; } = string.Empty;
        public string BuyerName { get; set; } = string.Empty;
        public string SellerEmail { get; set; } = string.Empty;
        public string SellerName { get; set; } = string.Empty;
        public string MessageContent { get; set; } = string.Empty;
        public string SenderEmail { get; set; } = string.Empty;
    }
}
