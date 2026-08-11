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

        // Update any Lands in DB that have no ImagePath, assigning them available demo image paths
        var lands = context.Lands.Where(l => string.IsNullOrEmpty(l.ImagePath) || l.ImagePath.Trim() == "").ToList();
        if (lands.Any())
        {
            var demoImages = new[]
            {
                "/uploads/lands/0c067f3c-94c5-4380-9086-75607ef6a907.jpeg",
                "/uploads/lands/2c853d98-789b-4d13-8620-7e8a0d870c70.jpeg",
                "/uploads/lands/53d70d3b-32b6-42c0-a630-f3c685e2f191.jpeg",
                "/uploads/lands/eb9f122e-4dea-4307-9aed-6d522ed582c7.jpeg"
            };
            int index = 0;
            foreach (var land in lands)
            {
                land.ImagePath = demoImages[index % demoImages.Length];
                index++;
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