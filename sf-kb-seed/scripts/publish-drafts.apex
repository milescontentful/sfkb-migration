// Run with: sf apex run --file scripts/publish-drafts.apex
// Publishes all draft master-language articles (run in batches if >200)
Integer n = 0;
for (Knowledge__kav a : [SELECT KnowledgeArticleId FROM Knowledge__kav
                         WHERE PublishStatus = 'Draft' AND IsLatestVersion = true AND IsMasterLanguage = true LIMIT 200]) {
    KbManagement.PublishingService.publishArticle(a.KnowledgeArticleId, true);
    n++;
}
System.debug('Published ' + n);
