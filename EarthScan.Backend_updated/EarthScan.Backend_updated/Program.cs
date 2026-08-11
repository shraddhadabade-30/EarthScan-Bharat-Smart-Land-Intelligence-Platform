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

        // Update any Lands in DB, assigning them distinct realistic agricultural land plot URLs
        var lands = context.Lands.ToList();
        if (lands.Any())
        {
            var demoImages = new[]
            {
                "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80", // Green empty agricultural land
                "https://images.unsplash.com/photo-1500937386664-56d159062255?auto=format&fit=crop&w=800&q=80", // Plowed empty soil farm field
                "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80", // Green crop field landscape
                "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=800&q=80", // Plowed soil lines in farm plot
                "https://images.unsplash.com/photo-1592997571659-0b21ff64313b?auto=format&fit=crop&w=800&q=80", // Green grass empty field plot
                "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80", // Countryside agriculture farm field
                "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=800&q=80", // Dry soil cultivation plot
                "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?auto=format&fit=crop&w=800&q=80", // Soil field under sky
                "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=800&q=80", // Green land field plot
                "https://images.unsplash.com/photo-1615811361523-6bd03d7748e7?auto=format&fit=crop&w=800&q=80"  // Cultivated soil beds
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