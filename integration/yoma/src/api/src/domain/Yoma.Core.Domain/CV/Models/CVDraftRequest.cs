// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  public class CVDraftRequest
  {
    public string Role { get; set; } = null!;

    public List<CVInterviewEntry> Entries { get; set; } = null!;
  }
}
