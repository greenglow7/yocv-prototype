// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  /// <summary>
  /// One interview answer set. The place the person names is kept by the client and never sent here.
  /// Months and the number are flat fields, so each model stays in its own file.
  /// </summary>
  public class CVInterviewEntry
  {
    public string Title { get; set; } = null!;

    public string What { get; set; } = null!;

    public string? ForWhom { get; set; }

    /// <summary>
    /// One of CVService.FrequencyChips, or null. Any other value is refused, since it goes to the model unmasked.
    /// </summary>
    public string? Frequency { get; set; }

    /// <summary>
    /// YYYY-MM, or null when not given.
    /// </summary>
    public string? MonthStart { get; set; }

    /// <summary>
    /// YYYY-MM, or null when the person is still doing it.
    /// </summary>
    public string? MonthEnd { get; set; }

    /// <summary>
    /// A whole number from 0 to 100000 as digits, or null for no number. Any other text is refused.
    /// </summary>
    public string? NumberValue { get; set; }

    /// <summary>
    /// One of CVService.UnitChips. Required with a number.
    /// </summary>
    public string? NumberUnit { get; set; }

    /// <summary>
    /// One of CVService.HedgeChips: exactly, about or at least. Required with a number.
    /// </summary>
    public string? NumberHedge { get; set; }

    public string? Outcome { get; set; }
  }
}
