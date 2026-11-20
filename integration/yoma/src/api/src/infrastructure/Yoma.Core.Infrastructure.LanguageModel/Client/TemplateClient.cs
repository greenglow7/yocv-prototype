// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
using Yoma.Core.Domain.LanguageModel.Interfaces;
using Yoma.Core.Domain.LanguageModel.Models;

namespace Yoma.Core.Infrastructure.LanguageModel.Client
{
  /// <summary>
  /// The fallback where the model is not enabled. It proposes nothing, so CVService shows its template sentence,
  /// built from the person's own words and checked like any other. No call leaves the API.
  /// </summary>
  public class TemplateClient : ILanguageModelClient
  {
    #region Class Variables
    public const string Provider_Template = "template";
    #endregion

    #region Public Members
    public Task<LanguageModelResponse> Complete(LanguageModelRequest request, CancellationToken cancellationToken = default)
    {
      ArgumentNullException.ThrowIfNull(request, nameof(request));

      return Task.FromResult(new LanguageModelResponse
      {
        Content = "{\"bullets\":[],\"skills\":[]}",
        Provider = Provider_Template,
        Model = Provider_Template
      });
    }
    #endregion
  }
}
