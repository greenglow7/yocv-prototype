// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  /// <summary>
  /// What the CV is built from. It holds no contact detail; the client reads those from the profile it already has.
  /// </summary>
  public class CVEvidenceRecord
  {
    /// <summary>
    /// A ticked credential is listed in place of its linked completion, so one piece of learning is listed once.
    /// </summary>
    public List<CVLearningItem> Learning { get; set; } = [];

    public List<CVSkill> Skills { get; set; } = [];

    /// <summary>
    /// available or unavailable.
    /// </summary>
    public string Wallet { get; set; } = null!;

    /// <summary>
    /// Wallet not available, when the wallet could not be read.
    /// </summary>
    public string? WalletNotice { get; set; }
  }
}
