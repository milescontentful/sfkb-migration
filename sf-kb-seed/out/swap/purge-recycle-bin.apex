// The Dev Edition 100-article cap counts articles in the recycle bin. Purge the 12 we removed.
List<KnowledgeArticle> gone = [SELECT Id FROM KnowledgeArticle WHERE IsDeleted = true ALL ROWS];
Database.emptyRecycleBin(gone);
System.debug('Purged ' + gone.size());
