import type { NextApiRequest, NextApiResponse } from "next";
import { checkAozoraApiHealth } from "@/lib/aozora/client";

type HealthResponse = {
  status: "ok" | "degraded";
  app: string;
  aozoraApi: {
    status: "ok" | "degraded";
    detail: string;
  };
  timestamp: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse>,
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({
      status: "degraded",
      app: "aozora-puzzle",
      aozoraApi: {
        status: "degraded",
        detail: "GET のみ利用できます",
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const aozoraApi = await checkAozoraApiHealth();
  res.status(200).json({
    status: aozoraApi.status,
    app: "aozora-puzzle",
    aozoraApi,
    timestamp: new Date().toISOString(),
  });
}
