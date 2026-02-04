import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { featureAccessData } from "./feature_access.data";

const prisma = new PrismaClient();

const defaultFeatureAccessData = {
  dashboard: true,
  teamchat: true,
  kundensuche: true,
  neukundenerstellung: true,
  einlagenauftrage: true,
  massschuhauftrage: true,
  massschafte: true,
  produktverwaltung: true,
  sammelbestellungen: true,
  nachrichten: true,
  terminkalender: true,
  monatsstatistik: true,
  mitarbeitercontrolling: true,
  einlagencontrolling: true,
  fusubungen: true,
  musterzettel: true,
  einstellungen: true,
  news_and_aktuelles: true,
  produktkatalog: true,
  balance: true,
  automatisierte_nachrichten: true,
  kasse_and_abholungen: true,
  finanzen_and_kasse: true,
  einnahmen_and_rechnungen: true,
};

const FEATURE_KEYS = Object.keys(
  defaultFeatureAccessData
) as (keyof typeof defaultFeatureAccessData)[];

const validatePartner = async (partnerId: string) => {
  const partner = await prisma.user.findUnique({
    where: { id: partnerId, role: "PARTNER" },
  });
  return partner;
};

export const getFeatureAccess = async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;

    const partner = await validatePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    const featureAccess = await getOrCreateFeatureAccess(partnerId);
    const allAvailableFeatures = convertToJSONFormat(featureAccess);

    res.status(200).json({
      success: true,
      message: "Feature access retrieved successfully",
      data: allAvailableFeatures,
    });
  } catch (error: any) {
    console.error("Get Feature Access error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const manageFeatureAccess = async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const updates = req.body;

    const partner = await validatePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    const featureAccess = await prisma.featureAccess.upsert({
      where: { partnerId },
      update: updates,
      create: {
        partnerId,
        ...defaultFeatureAccessData,
        ...updates,
      },
    });

    // Cascade: if admin reduced any feature for partner, revoke it for all employees of this partner
    const cascadeData: Record<string, boolean> = {};
    for (const key of FEATURE_KEYS) {
      if (featureAccess[key] === false) {
        cascadeData[key] = false;
      }
    }
    if (Object.keys(cascadeData).length > 0) {
      await prisma.employee_feature_access.updateMany({
        where: { partnerId },
        data: cascadeData,
      });
    }

    res.status(200).json({
      success: true,
      message: "Feature access updated successfully",
      data: featureAccess,
    });
  } catch (error: any) {
    console.error("Manage Feature Access error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const getOrCreateFeatureAccess = async (partnerId: string) => {
  let featureAccess = await prisma.featureAccess.findUnique({
    where: { partnerId },
  });

  if (!featureAccess) {
    return await prisma.featureAccess.create({
      data: {
        partnerId,
        ...defaultFeatureAccessData,
      },
    });
  }

  const newFields = [
    "news_and_aktuelles",
    "produktkatalog",
    "balance",
    "automatisierte_nachrichten",
    "kasse_and_abholungen",
    "finanzen_and_kasse",
    "einnahmen_and_rechnungen",
  ];

  const missingFields = newFields.filter(
    (field) =>
      featureAccess[field] === null || featureAccess[field] === undefined
  );

  if (missingFields.length > 0) {
    const updateData: any = {};
    missingFields.forEach((field) => {
      updateData[field] = true;
    });

    featureAccess = await prisma.featureAccess.update({
      where: { partnerId },
      data: updateData,
    });
  }

  return featureAccess;
};

export const partnerFeatureAccess = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;

    const partner = await validatePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    const featureAccess = await getOrCreateFeatureAccess(partnerId);
    const formattedData = convertToJSONFormat(featureAccess);

    res.status(200).json({
      success: true,
      message: "Feature access retrieved successfully",
      data: formattedData,
    });
  } catch (error: any) {
    console.error("Partner Feature Access error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

function convertToJSONFormat(featureAccess: any) {
  const fieldMapping = [
    { field: "dashboard", title: "Dashboard", path: "/dashboard" },
    { field: "teamchat", title: "Teamchat", path: "/dashboard/teamchat" },
    {
      field: "kundensuche",
      title: "Kundensuche",
      path: "/dashboard/customers",
    },
    {
      field: "neukundenerstellung",
      title: "Neukundenerstellung",
      path: "/dashboard/neukundenerstellung",
    },
    {
      field: "einlagenauftrage",
      title: "Einlagenaufträge",
      path: "/dashboard/orders",
    },
    {
      field: "massschuhauftrage",
      title: "Maßschuhaufträge",
      path: "/dashboard/massschuhauftraege",
    },
    {
      field: "massschafte",
      title: "Maßschäfte",
      path: "/dashboard/custom-shafts",
    },
    {
      field: "produktverwaltung",
      title: "Produktverwaltung",
      path: "/dashboard/lager",
    },
    {
      field: "sammelbestellungen",
      title: "Sammelbestellungen",
      path: "/dashboard/group-orders",
    },
    {
      field: "nachrichten",
      title: "Nachrichten",
      path: "/dashboard/email/inbox",
    },
    {
      field: "terminkalender",
      title: "Terminkalender",
      path: "/dashboard/calendar",
    },
    {
      field: "monatsstatistik",
      title: "Monatsstatistik",
      path: "/dashboard/monatsstatistik",
    },
    {
      field: "mitarbeitercontrolling",
      title: "Mitarbeitercontrolling",
      path: "/dashboard/mitarbeitercontrolling",
    },
    {
      field: "einlagencontrolling",
      title: "Einlagencontrolling",
      path: "/dashboard/einlagencontrolling",
    },
    {
      field: "fusubungen",
      title: "Fußübungen",
      path: "/dashboard/foot-exercises",
    },
    {
      field: "musterzettel",
      title: "Musterzettel",
      path: "/dashboard/musterzettel",
    },
    {
      field: "einstellungen",
      title: "Einstellungen",
      path: "/dashboard/settings",
    },
    {
      field: "news_and_aktuelles",
      title: "News & Aktuelles",
      path: "/dashboard/news",
    },
    {
      field: "produktkatalog",
      title: "Produktkatalog",
      path: "/dashboard/products",
    },
    {
      field: "balance",
      title: "Balance",
      path: "/dashboard/balance-dashboard",
    },
    {
      field: "automatisierte_nachrichten",
      title: "Automatisierte Nachrichten",
      path: "/dashboard/automatisierte-nachrichten",
    },
    {
      field: "kasse_and_abholungen",
      title: "Kasse & Abholungen",
      path: "/dashboard/kasse",
    },
    {
      field: "finanzen_and_kasse",
      title: "Finanzen & Kasse",
      path: "/dashboard/finanzen-kasse",
    },
    {
      field: "einnahmen_and_rechnungen",
      title: "Einnahmen & Rechnungen",
      path: "/dashboard/einnahmen",
    },
  ];

  const result = [];

  for (const mapping of fieldMapping) {
    const actionValue = featureAccess[mapping.field] ?? true;

    const item: any = {
      title: mapping.title,
      action: actionValue,
      path: mapping.path,
      nested: [],
    };

    if (mapping.field === "einstellungen") {
      item.nested = getSettingsNestedItems(featureAccess.einstellungen);
    }

    result.push(item);
  }

  return result;
}

function getSettingsNestedItems(parentAction: boolean) {
  const settingsNested = [
    { title: "Grundeinstellungen", path: "/dashboard/settings-profile" },
    {
      title: "Backup Einstellungen",
      path: "/dashboard/settings-profile/backup",
    },
    {
      title: "Kundenkommunikation",
      path: "/dashboard/settings-profile/communication",
    },
    {
      title: "Werkstattzettel",
      path: "/dashboard/settings-profile/werkstattzettel",
    },
    {
      title: "Benachrichtigungen",
      path: "/dashboard/settings-profile/benachrichtigungen",
    },
    {
      title: "Lagereinstellungen",
      path: "/dashboard/settings-profile/notifications",
    },
    {
      title: "Preisverwaltung",
      path: "/dashboard/settings-profile/preisverwaltung",
    },
    {
      title: "Software Scanstation",
      path: "/dashboard/settings-profile/software-scanstation",
    },
    { title: "Design & Logo", path: "/dashboard/settings-profile/design" },
    {
      title: "Passwort ändern",
      path: "/dashboard/settings-profile/changes-password",
    },
    { title: "Sprache", path: "/dashboard/settings-profile/sprache" },
    { title: "Fragen", path: "/dashboard/settings-profile/fragen" },
    {
      title: "Automatische Orders",
      path: "/dashboard/settings-profile/automatische-orders",
    },
  ];

  return settingsNested.map((item) => ({
    ...item,
    action: parentAction,
  }));
}

// /** Returns only the list of feature field names that exist in the system (no DB). */
// export const getAllAbleFeatures = async (req: Request, res: Response) => {
//   try {
//     res.status(200).json({
//       success: true,
//       message: "Features retrieved successfully",
//       data: featureAccessData,
//     });
//   } catch (error: any) {
//     console.error("Get All Able Features error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Something went wrong",
//       error: error.message,
//     });
//   }
// };
