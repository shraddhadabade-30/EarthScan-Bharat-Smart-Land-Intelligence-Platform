using EarthScan.Backend.Data;
using EarthScan.Backend.Models;
using EarthScan.Backend.Services; // Ensure this is added for the new service
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure Entity Framework Core with MySQL
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<EarthScanDbContext>(options =>
    options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)));

builder.Services.AddHostedService<EarthScan.Backend.Services.MandiUpdateWorker>();
builder.Services.AddHttpClient<GovernmentSatbaraService>();
builder.Services.AddHttpClient<GeminiService>();

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy => policy.SetIsOriginAllowed(origin => true)
                        .AllowAnyMethod()
                        .AllowAnyHeader());
});

// Configure JWT Authentication
var jwtSettings = builder.Configuration.GetSection("Jwt");
var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings["Issuer"],
            ValidAudience = jwtSettings["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(key)
        };
    });

var app = builder.Build();

// Seed database with default admin/user accounts if empty
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<EarthScanDbContext>();
        context.Database.Migrate();

        // Update any Lands in DB, assigning them distinct realistic crop image URLs
        var lands = context.Lands.ToList();
        if (lands.Any())
        {
            var demoImages = new[]
            {
                "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&w=800&q=80", // Sugarcane
                "https://images.unsplash.com/photo-1532499016263-f2c3e89df9cd?auto=format&fit=crop&w=800&q=80", // Grapes
                "https://images.unsplash.com/photo-1553137141-79172256f7ef?auto=format&fit=crop&w=800&q=80", // Orchard
                "https://images.unsplash.com/photo-1594900010629-9e8c3132e49c?auto=format&fit=crop&w=800&q=80", // Cotton
                "https://images.unsplash.com/photo-1541344999736-83eadb4b48f1?auto=format&fit=crop&w=800&q=80", // Pomegranate
                "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=800&q=80", // Wheat
                "https://images.unsplash.com/photo-1500937386664-56d159062255?auto=format&fit=crop&w=800&q=80", // Farm Landscape
                "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=800&q=80", // Rice Field
                "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=800&q=80"  // Coconut Farm
            };
            int index = 0;
            foreach (var land in lands)
            {
                if (string.IsNullOrEmpty(land.ImagePath) || land.ImagePath.Trim() == "" || land.ImagePath.StartsWith("http") || land.ImagePath.Contains("eb9f122e") || land.ImagePath.Contains("53d70d3b") || land.ImagePath.Contains("2c853d98") || land.ImagePath.Contains("0c067f3c"))
                {
                    land.ImagePath = demoImages[index % demoImages.Length];
                    index++;
                }
            }
            context.SaveChanges();
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine("Database migration/seeding failed: " + ex.Message);
    }
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// app.UseHttpsRedirection();
app.UseCors("AllowFrontend");
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();