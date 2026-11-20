// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
namespace Yoma.Core.Domain.CV.Models
{
  public class CVDraftRequest
  {
    public string Role { get; set; } = null!;

    public List<CVInterviewEntry> Entries { get; set; } = null!;

    /// <summary>
    /// Words to mask and nothing else: the place typed for each entry and the town on the contact line, so a typed
    /// place that differs from the profile city is masked even as the first word of a sentence. Never sent to the model.
    /// </summary>
    public List<string> KnownWords { get; set; } = [];

    /// <summary>
    /// The titles of the completions and credentials the person ticked in Step 1. Only these give the model its learning
    /// context, and only these give a skill the Confirmed from Yoma label in the draft. Get() still returns the full picker.
    /// </summary>
    public List<string> IncludeTitles { get; set; } = [];
  }
}
