// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  public class CVBullet
  {
    public int EntryIndex { get; set; }

    /// <summary>
    /// The sentence. On a refused skill proposal, the skill name.
    /// </summary>
    public string Text { get; set; } = null!;

    public string? SourceQuote { get; set; }

    public List<string>? SourceFields { get; set; }

    public List<string>? UsedNumbers { get; set; }

    /// <summary>
    /// model or template.
    /// </summary>
    public string Origin { get; set; } = null!;

    /// <summary>
    /// True when every model bullet for the entry was refused and the template wording is shown instead.
    /// </summary>
    public bool TemplateWording { get; set; }

    public List<string>? Checks { get; set; }

    /// <summary>
    /// The reason code, set on a refused bullet only.
    /// </summary>
    public string? Reason { get; set; }
  }
}
