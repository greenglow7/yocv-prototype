// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  public class CVSkill
  {
    public string Name { get; set; } = null!;

    /// <summary>
    /// The Yoma skill id when the name matches the skills lookup.
    /// </summary>
    public Guid? SkillId { get; set; }

    /// <summary>
    /// The strongest source's level.
    /// </summary>
    public CVSkillLevel Level { get; set; }

    /// <summary>
    /// The strongest source's label, printed after the skill on the CV.
    /// </summary>
    public string Label { get; set; } = null!;

    /// <summary>
    /// Every source, one line each, for the evidence record.
    /// </summary>
    public List<string> Sources { get; set; } = [];
  }
}
