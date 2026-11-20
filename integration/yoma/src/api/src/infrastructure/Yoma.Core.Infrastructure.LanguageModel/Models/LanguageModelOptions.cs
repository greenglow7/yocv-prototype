// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Infrastructure.LanguageModel.Models
{
  public class LanguageModelOptions
  {
    public const string Section = "LanguageModel";

    /// <summary>
    /// A name for the evidence record and the logs: azure, openai or local. The wire format is the same for all three.
    /// </summary>
    public string Provider { get; set; } = null!;

    /// <summary>
    /// The OpenAI-compatible base URL, for example Azure's https://<resource>.openai.azure.com/openai/v1 or a local server's /v1.
    /// </summary>
    public string BaseUrl { get; set; } = null!;

    /// <summary>
    /// Kept in sops per environment. Never in appsettings.json.
    /// </summary>
    public string ApiKey { get; set; } = null!;

    /// <summary>
    /// Optional. Empty means api-key on Azure's /openai/v1/ path and Authorization: Bearer otherwise.
    /// </summary>
    public string? AuthHeaderName { get; set; }

    public string Model { get; set; } = null!;

    public int RequestTimeoutSeconds { get; set; }

    public int MaxOutputTokens { get; set; }

    public decimal Temperature { get; set; }

    /// <summary>
    /// json_schema (the default when empty) or json_object, for servers that do not honour json_schema.
    /// </summary>
    public string? StructuredOutput { get; set; }
  }
}
