// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
using Yoma.Core.Domain.CV.Models;

namespace Yoma.Core.Domain.CV.Interfaces
{
  public interface ICVService
  {
    /// <summary>
    /// Drafts bullets and skills for the current user from their interview answers. Nothing is saved.
    /// </summary>
    Task<CVDraft> Draft(CVDraftRequest request);

    /// <summary>
    /// Returns the current user's learning and skills as recorded on Yoma, with the source of each skill.
    /// </summary>
    Task<CVEvidenceRecord> Get();
  }
}
