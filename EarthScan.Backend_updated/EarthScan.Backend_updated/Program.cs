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

        // Seed demo accounts
        if (!context.Users.Any(u => u.Email == "shraddha@earthscan.com"))
        {
            context.Users.Add(new User
            {
                Name = "Shraddha (Seller)",
                Email = "shraddha@earthscan.com",
                Role = "Land Buyer",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("Password123"),
                Phone = "9876543210",
                Location = "Pune",
                Village = "Pune",
                Pincode = "411001"
            });
        }
        if (!context.Users.Any(u => u.Email == "sanika@earthscan.com"))
        {
            context.Users.Add(new User
            {
                Name = "Sanika (Buyer)",
                Email = "sanika@earthscan.com",
                Role = "Land Buyer",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("Password123"),
                Phone = "9123456780",
                Location = "Mumbai",
                Village = "Mumbai",
                Pincode = "400001"
            });
        }
        context.SaveChanges();
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