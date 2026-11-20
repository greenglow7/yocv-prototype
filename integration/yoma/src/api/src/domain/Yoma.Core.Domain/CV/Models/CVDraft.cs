// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  public class CVDraft
  {
    public bool Draft { get; set; } = true;

    public List<CVBullet> Bullets { get; set; } = [];

    public List<CVBullet> Rejected { get; set; } = [];

    public List<CVSkill> Skills { get; set; } = [];

    /// <summary>
    /// live, or template when the environment is not enabled.
    /// </summary>
    public string Mode { get; set; } = null!;

    public string Provider { get; set; } = null!;

    public string Model { get; set; } = null!;

    public string Notice { get; set; } = "Draft. Nothing is saved until the person confirms it.";
  }
}
