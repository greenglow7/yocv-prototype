// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
using Flurl;
using Flurl.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using Yoma.Core.Domain.Core.Extensions;
using Yoma.Core.Domain.LanguageModel.Interfaces;
using Yoma.Core.Domain.LanguageModel.Models;
using Yoma.Core.Infrastructure.LanguageModel.Models;

namespace Yoma.Core.Infrastructure.LanguageModel.Client
{
  /// <summary>
  /// POST {BaseUrl}/chat/completions on any OpenAI-compatible endpoint: Azure OpenAI's /openai/v1/ path, OpenAI, or a local server.
  /// The provider is chosen at runtime by configuration, not at compile time.
  /// </summary>
  public class OpenAICompatibleClient : ILanguageModelClient
  {
    #region Class Variables
    private readonly ILogger<OpenAICompatibleClient> _logger;
    private readonly LanguageModelOptions _options;

    public const string StructuredOutput_JsonSchema = "json_schema";
    public const string StructuredOutput_JsonObject = "json_object";

    private const string Header_ApiKey = "api-key";
    private const string Header_Authorization = "Authorization";
    private const string Header_Authorization_Value_Prefix = "Bearer";
    private const string Path_Azure = "/openai/v1";
    #endregion

    #region Constructor
    public OpenAICompatibleClient(ILogger<OpenAICompatibleClient> logger, LanguageModelOptions options)
    {
      _logger = logger ?? throw new ArgumentNullException(nameof(logger));
      _options = options ?? throw new ArgumentNullException(nameof(options));
    }
    #endregion

    #region Public Members
    public async Task<LanguageModelResponse> Complete(LanguageModelRequest request, CancellationToken cancellationToken = default)
    {
      ArgumentNullException.ThrowIfNull(request, nameof(request));

      var schema = JObject.Parse(request.SchemaJson);
      var asObject = string.Equals(_options.StructuredOutput, StructuredOutput_JsonObject, StringComparison.OrdinalIgnoreCase);
      var messages = request.Messages.Select(o => new { role = o.Role, content = o.Content }).ToList();

      // json_object: the schema goes in the prompt, and the caller's checks still run on the result.
      if (asObject) messages.Insert(0, new { role = "system", content = $"Answer with one JSON object that matches this JSON schema: {schema.ToString(Newtonsoft.Json.Formatting.None)}" });

      var body = new
      {
        model = _options.Model,
        messages,
        response_format = asObject
          ? (object)new { type = StructuredOutput_JsonObject }
          : new { type = StructuredOutput_JsonSchema, json_schema = new { name = request.SchemaName, strict = true, schema } },
        temperature = request.Temperature ?? _options.Temperature,
        max_tokens = request.MaxOutputTokens ?? _options.MaxOutputTokens
      };

      var header = AuthHeader(_options);
      var started = DateTimeOffset.UtcNow;

      var resp = await _options.BaseUrl
        .AppendPathSegment("chat/completions")
        .WithHeader(header.Key, header.Value)
        .WithTimeout(TimeSpan.FromSeconds(_options.RequestTimeoutSeconds))
        .PostJsonAsync(body, cancellationToken: cancellationToken)
        .EnsureSuccessStatusCodeAsync();

      var json = JObject.Parse(await resp.GetStringAsync());
      var content = json.SelectToken("choices[0].message.content")?.Value<string>() ?? string.Empty;

      if (_logger.IsEnabled(LogLevel.Information))
        _logger.LogInformation("Language model {provider} answered in {ms} ms", _options.Provider, (int)(DateTimeOffset.UtcNow - started).TotalMilliseconds);

      return new LanguageModelResponse
      {
        Content = content,
        Provider = _options.Provider,
        Model = json.Value<string>("model") ?? _options.Model
      };
    }

    /// <summary>
    /// AuthHeaderName when set; else api-key on Azure's /openai/v1/ path, else Authorization: Bearer.
    /// </summary>
    public static KeyValuePair<string, string> AuthHeader(LanguageModelOptions options)
    {
      var name = !string.IsNullOrWhiteSpace(options.AuthHeaderName) ? options.AuthHeaderName
        : options.BaseUrl.TrimEnd('/').EndsWith(Path_Azure, StringComparison.OrdinalIgnoreCase) ? Header_ApiKey : Header_Authorization;

      var value = string.Equals(name, Header_Authorization, StringComparison.OrdinalIgnoreCase) ? $"{Header_Authorization_Value_Prefix} {options.ApiKey}" : options.ApiKey;
      return new KeyValuePair<string, string>(name, value);
    }
    #endregion
  }
}
