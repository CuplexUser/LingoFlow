// GET /api/knowledge: the knowledge map for one language (see knowledge.ts).

function registerKnowledgeRoutes(app: any, deps: any): void {
  const { requireAuth, LANGUAGES, getLevelCap, knowledge } = deps;

  app.get("/api/knowledge", requireAuth, async (req: any, res: any) => {
    const language = String(req.query.language || "").trim().toLowerCase();
    if (!LANGUAGES.some((entry: any) => entry.id === language)) {
      return res.status(400).json({ error: "A supported language is required" });
    }
    return res.json(await knowledge.buildKnowledge(req.authUserId, language, await getLevelCap(req)));
  });
}

module.exports = { registerKnowledgeRoutes };
