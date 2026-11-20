// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Swashbuckle.AspNetCore.Annotations;
using System.Net;
using Yoma.Core.Api.Middleware;
using Yoma.Core.Domain.Core;
using Yoma.Core.Domain.CV.Interfaces;
using Yoma.Core.Domain.CV.Models;

namespace Yoma.Core.Api.Controllers
{
  [Route($"api/{Common.Constants.Api_Version}/cv")]
  [ApiController]
  [Authorize(Policy = Common.Constants.Authorization_Policy)]
  [SwaggerTag("(by default, User role required)")]
  public class CVController : ControllerBase
  {
    #region Class Variables
    private readonly ILogger<CVController> _logger;
    private readonly ICVService _cvService;
    #endregion

    #region Constructor
    public CVController(
      ILogger<CVController> logger,
      ICVService cvService)
    {
      _logger = logger;
      _cvService = cvService;
    }
    #endregion

    #region Public Members
    #region Authenticated User Based Actions
    [SwaggerOperation(Summary = "Return the learning and skills a CV can be built from (Authenticated User)",
      Description = "Each skill carries its sources and the label of the strongest one. The wallet is reported as not available when it cannot be read")]
    [HttpGet]
    [ProducesResponseType(typeof(CVEvidenceRecord), (int)HttpStatusCode.OK)]
    [Authorize(Roles = $"{Constants.Role_User}")]
    public async Task<IActionResult> Get()
    {
      if (_logger.IsEnabled(LogLevel.Information)) _logger.LogInformation("Handling request {requestName}", nameof(Get));

      var result = await _cvService.Get();

      if (_logger.IsEnabled(LogLevel.Information)) _logger.LogInformation("Request {requestName} handled", nameof(Get));

      return StatusCode((int)HttpStatusCode.OK, result);
    }

    [SwaggerOperation(Summary = "Draft CV bullets and skills from interview answers (Authenticated User)",
      Description = "Every sentence is checked against the person's own words before it is returned. Nothing is saved until the person confirms it")]
    [HttpPost("draft")]
    [UserActionLock]
    [ProducesResponseType(typeof(CVDraft), (int)HttpStatusCode.OK)]
    [Authorize(Roles = $"{Constants.Role_User}")]
    public async Task<IActionResult> Draft([FromBody] CVDraftRequest request)
    {
      if (_logger.IsEnabled(LogLevel.Information)) _logger.LogInformation("Handling request {requestName}", nameof(Draft));

      var result = await _cvService.Draft(request);

      if (_logger.IsEnabled(LogLevel.Information)) _logger.LogInformation("Request {requestName} handled", nameof(Draft));

      return StatusCode((int)HttpStatusCode.OK, result);
    }
    #endregion Authenticated User Based Actions
    #endregion
  }
}
