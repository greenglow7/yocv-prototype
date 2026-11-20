// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.LanguageModel.Models
{
  public class LanguageModelMessage
  {
    /// <summary>
    /// system or user.
    /// </summary>
    public string Role { get; set; } = null!;

    public string Content { get; set; } = null!;
  }
}
