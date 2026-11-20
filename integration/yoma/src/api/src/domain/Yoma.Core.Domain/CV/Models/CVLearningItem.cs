// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  /// <summary>
  /// A completed learning opportunity or an issued credential, listed as what it is. Never called a qualification.
  /// </summary>
  public class CVLearningItem
  {
    /// <summary>
    /// completion or credential.
    /// </summary>
    public string Kind { get; set; } = null!;

    public string Title { get; set; } = null!;

    public string Issuer { get; set; } = null!;

    public DateTimeOffset? Date { get; set; }

    public List<string> Skills { get; set; } = [];
  }
}
