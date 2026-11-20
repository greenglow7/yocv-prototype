// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
using Yoma.Core.Domain.LanguageModel.Models;

namespace Yoma.Core.Domain.LanguageModel.Interfaces
{
  /// <summary>
  /// One chat completion with structured output. The caller builds the messages and never passes a user profile.
  /// </summary>
  public interface ILanguageModelClient
  {
    Task<LanguageModelResponse> Complete(LanguageModelRequest request, CancellationToken cancellationToken = default);
  }
}
