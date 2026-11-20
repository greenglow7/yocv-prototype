// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Yoma.Core.Domain.Core.Interfaces;
using Yoma.Core.Domain.Core.Models;
using Yoma.Core.Domain.LanguageModel.Interfaces;
using Yoma.Core.Infrastructure.LanguageModel.Client;
using Yoma.Core.Infrastructure.LanguageModel.Models;

namespace Yoma.Core.Infrastructure.LanguageModel
{
  public static class Startup
  {
    #region Public Members
    public static IEndpointRouteBuilder MapLanguageModelProviderHealthEndpoints(this IEndpointRouteBuilder endpoints, string apiVersion)
    {
      endpoints.MapHealthChecks($"/api/{apiVersion}/health/ready/llm", new HealthCheckOptions
      {
        Predicate = check => check.Tags.Contains("llm")
      }).AllowAnonymous();

      return endpoints;
    }

    /// <summary>
    /// Binds and validates the options at start. The endpoint, key and model are required only where
    /// AppSettings.LanguageModelEnabledEnvironments enables the model; elsewhere the template client answers.
    /// </summary>
    public static void ConfigureServices_LanguageModelProvider(this IServiceCollection services, IConfiguration configuration)
    {
      ArgumentNullException.ThrowIfNull(services, nameof(services));
      ArgumentNullException.ThrowIfNull(configuration, nameof(configuration));

      services.AddOptions<LanguageModelOptions>()
        .Bind(configuration.GetSection(LanguageModelOptions.Section))
        .Validate(options => options.RequestTimeoutSeconds > 0, $"{LanguageModelOptions.Section}.{nameof(LanguageModelOptions.RequestTimeoutSeconds)} must be positive")
        .Validate(options => options.MaxOutputTokens > 0, $"{LanguageModelOptions.Section}.{nameof(LanguageModelOptions.MaxOutputTokens)} must be positive")
        .Validate(options => options.Temperature >= 0 && options.Temperature <= 2, $"{LanguageModelOptions.Section}.{nameof(LanguageModelOptions.Temperature)} must be between 0 and 2")
        .Validate(options => string.IsNullOrEmpty(options.StructuredOutput) || options.StructuredOutput is OpenAICompatibleClient.StructuredOutput_JsonSchema or OpenAICompatibleClient.StructuredOutput_JsonObject,
          $"{LanguageModelOptions.Section}.{nameof(LanguageModelOptions.StructuredOutput)} must be {OpenAICompatibleClient.StructuredOutput_JsonSchema} or {OpenAICompatibleClient.StructuredOutput_JsonObject}")
        // The one rule relaxed when the environment is not enabled.
        .Validate<IEnvironmentProvider, IOptions<AppSettings>>((options, environment, appSettings) =>
          !appSettings.Value.LanguageModelEnabledEnvironmentsAsEnum.HasFlag(environment.Environment) ||
          !string.IsNullOrWhiteSpace(options.BaseUrl) && !string.IsNullOrWhiteSpace(options.ApiKey) && !string.IsNullOrWhiteSpace(options.Model),
          $"{LanguageModelOptions.Section}.{nameof(LanguageModelOptions.BaseUrl)}, {nameof(LanguageModelOptions.ApiKey)} and {nameof(LanguageModelOptions.Model)} are required when the language model is enabled")
        .ValidateOnStart();
    }

    public static void ConfigureServices_InfrastructureLanguageModelProvider(this IServiceCollection services)
    {
      services.AddScoped<ILanguageModelClientFactory, OpenAICompatibleClientFactory>();
      services.AddSingleton<HealthCheck>();

      services.AddHealthChecks().AddCheck<HealthCheck>(name: "Language Model External", failureStatus: HealthStatus.Unhealthy, tags: ["llm"]);
    }
    #endregion
  }
}
