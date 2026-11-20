// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
using Flurl;
using Flurl.Http;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Yoma.Core.Domain.Core.Exceptions;
using Yoma.Core.Domain.Core.Extensions;
using Yoma.Core.Domain.Core.Interfaces;
using Yoma.Core.Domain.Core.Models;
using Yoma.Core.Infrastructure.LanguageModel.Client;
using Yoma.Core.Infrastructure.LanguageModel.Models;

namespace Yoma.Core.Infrastructure.LanguageModel
{
  /// <summary>
  /// GET {BaseUrl}/models with the configured key. Healthy without a call where the model is not enabled.
  /// </summary>
  public sealed class HealthCheck : IHealthCheck
  {
    #region Class Variables
    private readonly LanguageModelOptions _options;
    private readonly AppSettings _appSettings;
    private readonly IEnvironmentProvider _environmentProvider;
    #endregion

    #region Constructor
    public HealthCheck(IOptions<LanguageModelOptions> options, IOptions<AppSettings> appSettings, IEnvironmentProvider environmentProvider)
    {
      _options = options.Value ?? throw new ArgumentNullException(nameof(options));
      _appSettings = appSettings.Value ?? throw new ArgumentNullException(nameof(appSettings));
      _environmentProvider = environmentProvider ?? throw new ArgumentNullException(nameof(environmentProvider));
    }
    #endregion

    #region Public Members
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
      if (!_appSettings.LanguageModelEnabledEnvironmentsAsEnum.HasFlag(_environmentProvider.Environment))
        return HealthCheckResult.Healthy($"{LanguageModelOptions.Section}: not enabled, template wording in use");

      var url = _options.BaseUrl.TrimEnd('/') + "/models";
      try
      {
        await url
          .WithHeader(OpenAICompatibleClient.AuthHeader(_options).Key, OpenAICompatibleClient.AuthHeader(_options).Value)
          .WithTimeout(TimeSpan.FromSeconds(_options.RequestTimeoutSeconds))
          .GetAsync(cancellationToken: cancellationToken)
          .EnsureSuccessStatusCodeAsync();

        return HealthCheckResult.Healthy($"{LanguageModelOptions.Section} endpoint: OK");
      }
      catch (HttpClientException ex)
      {
        return HealthCheckResult.Unhealthy($"{LanguageModelOptions.Section} [{(int)ex.StatusCode} {ex.StatusCode}] {url}");
      }
      catch (TaskCanceledException)
      {
        return HealthCheckResult.Unhealthy($"{LanguageModelOptions.Section} [timeout] {url}");
      }
      catch (Exception ex)
      {
        return HealthCheckResult.Unhealthy($"{LanguageModelOptions.Section} [{ex.GetType().Name}] {url}");
      }
    }
    #endregion
  }
}
