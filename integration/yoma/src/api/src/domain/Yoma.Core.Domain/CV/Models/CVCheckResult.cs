// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  public class CVCheckResult
  {
    public bool Ok { get; set; }

    /// <summary>
    /// The first failing check: invented_number, hedge_dropped, contact_detail, invented_name, overstated,
    /// weak_opening, length, not_one_sentence, exclamation or quote_not_found. Null when Ok.
    /// </summary>
    public string? Reason { get; set; }

    public List<string> Checks { get; set; } = [];

    public static CVCheckResult Pass(List<string> checks) => new() { Ok = true, Checks = checks };

    public static CVCheckResult Fail(string reason) => new() { Ok = false, Reason = reason };
  }
}
