// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.LanguageModel.Models
{
  public class LanguageModelResponse
  {
    /// <summary>
    /// The JSON the model returned, as text. The caller parses and checks it.
    /// </summary>
    public string Content { get; set; } = null!;

    public string Provider { get; set; } = null!;

    public string Model { get; set; } = null!;
  }
}
