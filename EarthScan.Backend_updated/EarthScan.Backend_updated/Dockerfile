FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY ["EarthScan.Backend.csproj", "./"]
RUN dotnet restore "EarthScan.Backend.csproj"

# Copy all source files and publish
COPY . .
RUN dotnet publish "EarthScan.Backend.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose backend port
EXPOSE 5130
ENV ASPNETCORE_URLS=http://+:5130

# Run backend application (does not execute migrations or seeders)
ENTRYPOINT ["dotnet", "EarthScan.Backend.dll"]
