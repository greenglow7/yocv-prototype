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
    /// The number as typed, digits or words.
    /// </summary>
    public string? NumberValue { get; set; }

    public string? NumberUnit { get; set; }

    /// <summary>
    /// about, at least or exactly.
    /// </summary>
    public string? NumberHedge { get; set; }

    public string? Outcome { get; set; }
  }
}
