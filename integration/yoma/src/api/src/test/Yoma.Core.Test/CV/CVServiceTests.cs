// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
using FluentValidation;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;
using Yoma.Core.Domain.Core.Interfaces;
using Yoma.Core.Domain.Core.Models;
using Yoma.Core.Domain.CV.Models;
using Yoma.Core.Domain.CV.Services;
using Yoma.Core.Domain.Entity;
using Yoma.Core.Domain.Entity.Interfaces;
using Yoma.Core.Domain.Entity.Models;
using Yoma.Core.Domain.LanguageModel.Interfaces;
using Yoma.Core.Domain.LanguageModel.Models;
using Yoma.Core.Domain.Lookups.Interfaces;
using Yoma.Core.Domain.Lookups.Models;
using Yoma.Core.Domain.MyOpportunity.Interfaces;
using Yoma.Core.Domain.MyOpportunity.Models;
using Yoma.Core.Domain.SSI.Interfaces;
using Yoma.Core.Domain.SSI.Models;

namespace Yoma.Core.Test.CV
{
  public class CVServiceTests
  {
    #region Class Variables
    private const string Role = "Shop assistant";
    #endregion Class Variables

    #region Tests
    [Theory]
    [InlineData("Served about 40 customers a day at the fruit stall by the taxi rank.", true, null)]
    [InlineData("Served about forty customers a day at the fruit stall by the taxi rank.", true, null)]
    [InlineData("Served about 45 customers a day at the fruit stall by the taxi rank.", false, "invented_number")]
    [InlineData("Served dozens of customers a day at the fruit stall by the taxi rank.", false, "invented_number")]
    [InlineData("Served customers at the fruit stall by the taxi rank every day since March.", false, "invented_number")]
    [InlineData("Served 40 customers a day at the fruit stall by the taxi rank.", false, "hedge_dropped")]
    public void CheckBulletRefusesAnInventedNumber(string text, bool ok, string? reason)
    {
      var result = CVService.CheckBullet(text, Entry(), Role);

      Assert.Equal(ok, result.Ok);
      Assert.Equal(reason, result.Reason);
    }

    [Theory]
    [InlineData("Served about 40 customers a day as a professional fruit seller.")]
    [InlineData("Served about 40 customers a day as a certified fruit seller.")]
    [InlineData("Managed the fruit stall by the taxi rank for about 40 customers a day.")]
    [InlineData("Led the fruit stall by the taxi rank for about 40 customers a day.")]
    public void CheckBulletRefusesInflationAndARoleUpgrade(string text)
    {
      var result = CVService.CheckBullet(text, Entry(), Role);

      Assert.False(result.Ok);
      Assert.Equal("overstated", result.Reason);
    }

    [Fact]
    public void CheckBulletAllowsARoleWordThePersonUsed()
    {
      var entry = Entry();
      entry.What = "I manage the fruit stall by the taxi rank";

      Assert.True(CVService.CheckBullet("Managed the fruit stall by the taxi rank for about 40 customers a day.", entry, Role).Ok);
    }

    [Fact]
    public async Task DraftKeepsTheCheckedBulletAndRefusesTheInventedOne()
    {
      var client = new FakeClient("""
        {"bullets":[
          {"text":"Served about 60 customers a day at [name1] [name2]'s fruit stall.","usedNumbers":["60"],"sourceFields":["what","number"],"sourceQuote":"I sell fruit at [name1] [name2]'s stall"},
          {"text":"Sold fruit at [name1] [name2]'s stall to about 40 customers a day.","usedNumbers":["40"],"sourceFields":["what","number"],"sourceQuote":"I sell fruit at [name1] [name2]'s stall"}
        ],"skills":[]}
        """);
      var service = Service(client);
      var entry = Entry();
      entry.What = "I sell fruit at Mama Joy's stall, Thandi on 0710000000";

      var draft = await service.Draft(new CVDraftRequest { Role = Role, Entries = [entry] });

      var kept = Assert.Single(draft.Bullets);
      Assert.Equal("Sold fruit at Mama Joy's stall to about 40 customers a day.", kept.Text);
      Assert.Contains(draft.Rejected, o => o.Reason == "invented_number");
      Assert.Equal("Draft. Nothing is saved until the person confirms it.", draft.Notice);

      // Names, the person's own name and the phone number never reach the model.
      var sent = string.Join("\n", client.Requests.SelectMany(o => o.Messages).Select(o => o.Content));
      Assert.DoesNotContain("Mama", sent);
      Assert.DoesNotContain("Joy", sent);
      Assert.DoesNotContain("Thandi", sent);
      Assert.DoesNotContain("0710000000", sent);
    }

    [Fact]
    public async Task DraftShowsTheTemplateWordingWhenEveryModelBulletIsRefused()
    {
      var client = new FakeClient("""
        {"bullets":[{"text":"Expertly served 100 customers a day at the fruit stall.","usedNumbers":["100"],"sourceFields":["what"],"sourceQuote":"I sell fruit at the stall"}],"skills":[]}
        """);

      var draft = await Service(client).Draft(new CVDraftRequest { Role = Role, Entries = [Entry()] });

      var bullet = Assert.Single(draft.Bullets);
      Assert.Equal("template", bullet.Origin);
      Assert.True(bullet.TemplateWording);
      Assert.Contains("about 40 customers", bullet.Text);
      Assert.True(CVService.CheckBullet(bullet.Text, Entry(), Role).Ok);
    }

    [Fact]
    public async Task DraftRefusesAnEndMonthBeforeTheStart()
    {
      var entry = Entry();
      entry.MonthStart = "2025-06";
      entry.MonthEnd = "2025-03";

      var ex = await Assert.ThrowsAsync<ValidationException>(() => Service(new FakeClient("{}")).Draft(new CVDraftRequest { Role = Role, Entries = [entry] }));
      Assert.Contains(ex.Errors, o => o.PropertyName == "Entries[0].Months");
    }

    [Fact]
    public void VolumeNeverPromotesASkillAndAYomaRecordDoes()
    {
      var own = Enumerable.Range(0, 3).Select(i => new CVService.CVSkillEvidence("Customer service", null, CVSkillLevel.ShownInWork, CVService.Label_ShownInWork, $"entry:{i}", "Interview answer")).ToList();

      var fromWords = Assert.Single(CVService.CombineSkills(own));
      Assert.Equal(CVSkillLevel.ShownInWork, fromWords.Level);
      Assert.Equal(3, fromWords.Sources.Count);

      var recorded = new CVService.CVSkillEvidence("Customer Service", Guid.NewGuid(), CVSkillLevel.RecordedOnYoma, CVService.Label_RecordedOnYoma, "learning:retail basics", "Completed: Retail basics");
      var withYoma = Assert.Single(CVService.CombineSkills([.. own, recorded, recorded]));
      Assert.Equal(CVSkillLevel.RecordedOnYoma, withYoma.Level);
      Assert.Equal("Confirmed from Yoma", withYoma.Label);
      Assert.Equal(4, withYoma.Sources.Count);
    }

    [Fact]
    public void SkillsAreOrderedStrongestFirstAndAnInflatedOwnNameIsDropped()
    {
      var skills = CVService.CombineSkills(
      [
        new("Cash handling", null, CVSkillLevel.SelfStated, CVService.Label_SelfStated, "self:1", "Self-attested on Yoma"),
        new("Professional selling", null, CVSkillLevel.ShownInWork, CVService.Label_ShownInWork, "entry:0", "Interview answer"),
        new("Stock keeping", null, CVSkillLevel.ShownInWork, CVService.Label_ShownInWork, "entry:0", "Interview answer"),
        new("Certified food handling", null, CVSkillLevel.RecordedOnYoma, CVService.Label_RecordedOnYoma, "learning:food", "Credential: Food handling")
      ]);

      Assert.Equal(new[] { "Certified food handling", "Stock keeping", "Cash handling" }, skills.Select(o => o.Name));
    }

    [Fact]
    public async Task TheWalletIsNotAvailableWhenSSIIsOff()
    {
      var wallet = new Mock<ISSIWalletService>(MockBehavior.Strict);

      var record = await Service(new FakeClient("{}"), wallet.Object, ssiEnvironments: "Production").Get();

      Assert.Equal(CVService.Wallet_Unavailable, record.Wallet);
      Assert.Equal("Wallet not available", record.WalletNotice);
      wallet.VerifyNoOtherCalls();
    }
    #endregion Tests

    #region Private Members
    private static CVInterviewEntry Entry() => new()
    {
      Title = "Fruit stall",
      What = "I sell fruit at the stall by the taxi rank",
      ForWhom = "customers",
      Frequency = "every day",
      MonthStart = "2024-01",
      MonthEnd = "2024-12",
      NumberValue = "40",
      NumberUnit = "customers a day",
      NumberHedge = "about",
      Outcome = null
    };

    private static CVService Service(ILanguageModelClient client, ISSIWalletService? wallet = null, string ssiEnvironments = "Local")
    {
      var environment = new Mock<IEnvironmentProvider>();
      environment.Setup(o => o.Environment).Returns(Domain.Core.Environment.Local);

      var appSettings = Options.Create(new AppSettings { SSIEnabledEnvironments = ssiEnvironments });

      var profile = new Mock<IUserProfileService>();
      profile.Setup(o => o.Get()).Returns(new UserProfile { Username = "fictional.user", FirstName = "Thandi", Surname = "Mokoena", City = "Khayelitsha" });
      profile.Setup(o => o.GetSkills(It.IsAny<UserSkillType?>())).Returns(new List<UserSkillInfo>());

      var opportunities = new Mock<IMyOpportunityService>();
      opportunities.Setup(o => o.Search(It.IsAny<MyOpportunitySearchFilter>(), null)).Returns(new MyOpportunitySearchResults { Items = [] });

      if (wallet == null)
      {
        var empty = new Mock<ISSIWalletService>();
        empty.Setup(o => o.SearchUserCredentials(It.IsAny<SSIWalletSearchFilter>())).ReturnsAsync(new SSIWalletSearchResults { Items = [] });
        wallet = empty.Object;
      }

      var skills = new Mock<ISkillService>();
      skills.Setup(o => o.GetByNameOrNull(It.IsAny<string>())).Returns((Skill?)null);

      var factory = new Mock<ILanguageModelClientFactory>();
      factory.Setup(o => o.CreateClient()).Returns(client);

      return new CVService(NullLogger<CVService>.Instance, appSettings, environment.Object, profile.Object, opportunities.Object, wallet, skills.Object, factory.Object);
    }

    private sealed class FakeClient(string content) : ILanguageModelClient
    {
      public List<LanguageModelRequest> Requests { get; } = [];

      public Task<LanguageModelResponse> Complete(LanguageModelRequest request, CancellationToken cancellationToken = default)
      {
        Requests.Add(request);
        return Task.FromResult(new LanguageModelResponse { Content = content, Provider = "fake", Model = "fake" });
      }
    }
    #endregion Private Members
  }
}
