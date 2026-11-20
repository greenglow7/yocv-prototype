// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.LanguageModel.Models
{
  public class LanguageModelRequest
  {
    public string SchemaName { get; set; } = null!;

    public string SchemaJson { get; set; } = null!;

    public List<LanguageModelMessage> Messages { get; set; } = null!;

    public int? MaxOutputTokens { get; set; }

    public decimal? Temperature { get; set; }
  }
}
