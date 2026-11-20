// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Yoma.Core.Domain.Core.Interfaces;
using Yoma.Core.Domain.Core.Models;
using Yoma.Core.Domain.LanguageModel.Interfaces;
using Yoma.Core.Infrastructure.LanguageModel.Models;

namespace Yoma.Core.Infrastructure.LanguageModel.Client
{
  /// <summary>
  /// The OpenAI-compatible client where AppSettings.LanguageModelEnabledEnvironments enables the model,
  /// else the template client, as the Emsi client falls back to its embedded payload.
  /// </summary>
  public class OpenAICompatibleClientFactory : ILanguageModelClientFactory
  {
    #region Class Variables
    private readonly ILogger<OpenAICompatibleClient> _logger;
    private readonly IEnvironmentProvider _environmentProvider;
    private readonly AppSettings _appSettings;
    private readonly LanguageModelOptions _options;
    #endregion

    #region Constructor
    public OpenAICompatibleClientFactory(ILogger<OpenAICompatibleClient> logger,
      IEnvironmentProvider environmentProvider,
      IOptions<AppSettings> appSettings,
      IOptions<LanguageModelOptions> options)
    {
      _logger = logger;
      _environmentProvider = environmentProvider;
      _appSettings = appSettings.Value;
      _options = options.Value;
    }
    #endregion

    #region Public Members
    public ILanguageModelClient CreateClient()
    {
      if (_appSettings.LanguageModelEnabledEnvironmentsAsEnum.HasFlag(_environmentProvider.Environment))
        return new OpenAICompatibleClient(_logger, _options);

      if (_logger.IsEnabled(LogLevel.Information)) _logger.LogInformation("Used the template client for environment '{environment}'", _environmentProvider.Environment);
      return new TemplateClient();
    }
    #endregion
  }
}
