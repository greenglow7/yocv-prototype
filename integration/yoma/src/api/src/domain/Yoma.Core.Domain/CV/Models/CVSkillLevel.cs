// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  /// <summary>
  /// Strongest first. Only a Yoma record or a vouch moves a skill up; volume never does.
  /// </summary>
  public enum CVSkillLevel
  {
    /// <summary>
    /// S1: a verified Yoma skill, a completed opportunity or an issued wallet credential.
    /// </summary>
    RecordedOnYoma,

    /// <summary>
    /// S2: a vouch on the person's YoCard. Not available inside Yoma until vouches are hosted there.
    /// </summary>
    Vouched,

    /// <summary>
    /// S3: shown in the person's own interview answer, with a quote that passes the quote check.
    /// </summary>
    ShownInWork,

    /// <summary>
    /// S4: added by hand, or a Yoma self-attested skill.
    /// </summary>
    SelfStated
  }
}
