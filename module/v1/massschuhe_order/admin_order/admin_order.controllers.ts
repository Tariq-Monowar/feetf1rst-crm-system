import { Request, Response } from "express";
import fs from "fs";

import { PrismaClient } from "@prisma/client";
// Removed getImageUrl - images are now S3 URLs
const prisma = new PrismaClient();

export const sendToAdminOrder_1 = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;

    // Validate request
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not authenticated",
      });
    }

    const getField = (key: string) => {
      if (req.body[key] !== undefined) return req.body[key];

      const normalize = (str: string) =>
        str
          .replace(/Ã¶/g, "ö")
          .replace(/Ã¼/g, "ü")
          .replace(/Ã¤/g, "ä")
          .replace(/Ã\x9F/g, "ß")
          .replace(/Ã\x9C/g, "Ü")
          .replace(/Ã\x84/g, "Ä")
          .replace(/Ã\x96/g, "Ö")
          .toLowerCase();

      const normalizedKey = normalize(key);
      const foundKey = Object.keys(req.body).find(
        (k) => normalize(k) === normalizedKey
      );
      return foundKey ? req.body[foundKey] : undefined;
    };

    const orNull = (value: any) => (value !== undefined ? value : null);

    const toBoolean = (value: any): boolean | null => {
      if (value === undefined) return null;
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        return (
          lower.includes("ja") ||
          lower.includes("yes") ||
          lower === "true" ||
          value === "1"
        );
      }
      return Boolean(value);
    };

    // Helper: Parse totalPrice
    const parsePrice = (value: any): number | null => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = parseFloat(value.toString());
      return isNaN(parsed) ? null : parsed;
    };

    const files = req.files as any;

    if (files) {
      console.log("Received file fields:", Object.keys(files));
    }

    const threed_model_right =
      files?.image3d_1?.[0]?.filename ||
      files?.threed_model_right?.[0]?.filename ||
      null;
    const threed_model_left =
      files?.image3d_2?.[0]?.filename ||
      files?.threed_model_left?.[0]?.filename ||
      null;
    const invoice = files?.invoice?.[0]?.filename || null;

    // Verify order exists
    let order;
    try {
      order = await prisma.massschuhe_order.findUnique({
        where: { id: orderId },
        select: { id: true },
      });
    } catch (dbError: any) {
      console.error("Database error finding order:", dbError);
      return res.status(500).json({
        success: false,
        message: "Error verifying order",
        error:
          process.env.NODE_ENV === "development" ? dbError.message : undefined,
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Create custom shaft order
    let adminOrder;
    try {
      adminOrder = await prisma.custom_shafts.create({
        data: {
          massschuhe_order_id: orderId,
          partnerId: userId,
          image3d_1: threed_model_right,
          image3d_2: threed_model_left,
          invoice: invoice,
          isCompleted: false,
          catagoary: "Halbprobenerstellung",
          Bettungsdicke: orNull(getField("Bettungsdicke")),
          Haertegrad_Shore: orNull(getField("Haertegrad_Shore")),
          Fersenschale: orNull(getField("Fersenschale")),
          Laengsgewölbestütze: orNull(getField("Laengsgewölbestütze")),
          Palotte_oder_Querpalotte: orNull(
            getField("Palotte_oder_Querpalotte")
          ),
          Korrektur_der_Fußstellung: orNull(
            getField("Korrektur_der_Fußstellung")
          ),
          Zehenelemente_Details: orNull(getField("Zehenelemente_Details")),
          eine_korrektur_nötig_ist: orNull(
            getField("eine_korrektur_nötig_ist")
          ),
          Spezielles_Fußproblem: orNull(getField("Spezielles_Fußproblem")),
          Zusatzkorrektur_Absatzerhöhung: orNull(
            getField("Zusatzkorrektur_Absatzerhöhung")
          ),
          Vertiefungen_Aussparungen: orNull(
            getField("Vertiefungen_Aussparungen")
          ),
          Oberfläche_finish: orNull(getField("Oberfläche_finish")),
          Überzug_Stärke: orNull(getField("Überzug_Stärke")),
          Anmerkungen_zur_Bettung: orNull(getField("Anmerkungen_zur_Bettung")),
          Leisten_mit_ohne_Platzhalter: orNull(
            getField("Leisten_mit_ohne_Platzhalter")
          ),
          Schuhleisten_Typ: orNull(getField("Schuhleisten_Typ")),
          Material_des_Leisten: orNull(getField("Material_des_Leisten")),
          Leisten_gleiche_Länge: toBoolean(getField("Leisten_gleiche_Länge")),
          Absatzhöhe: orNull(getField("Absatzhöhe")),
          Abrollhilfe: orNull(getField("Abrollhilfe")),
          Spezielle_Fußprobleme_Leisten: orNull(
            getField("Spezielle_Fußprobleme_Leisten")
          ),
          Anmerkungen_zum_Leisten: orNull(getField("Anmerkungen_zum_Leisten")),
          totalPrice: parsePrice(getField("totalPrice")),
        },
        select: {
          id: true,
          image3d_1: true,
          image3d_2: true,
          invoice: true,
          isCompleted: true,
          catagoary: true,
          Bettungsdicke: true,
          Haertegrad_Shore: true,
          Fersenschale: true,
          Laengsgewölbestütze: true,
          Palotte_oder_Querpalotte: true,
          Korrektur_der_Fußstellung: true,
          Zehenelemente_Details: true,
          eine_korrektur_nötig_ist: true,
          Spezielles_Fußproblem: true,
          Zusatzkorrektur_Absatzerhöhung: true,
          Vertiefungen_Aussparungen: true,
          Oberfläche_finish: true,
          Überzug_Stärke: true,
          Anmerkungen_zur_Bettung: true,
          Leisten_mit_ohne_Platzhalter: true,
          Schuhleisten_Typ: true,
          Material_des_Leisten: true,
          Leisten_gleiche_Länge: true,
          Absatzhöhe: true,
          Abrollhilfe: true,
          Spezielle_Fußprobleme_Leisten: true,
          Anmerkungen_zum_Leisten: true,
          totalPrice: true,
        },
      });
    } catch (error: any) {
      console.error("Database error creating custom_shafts:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating order",
        error: error.message,
      });
    }

    // update the massschuhe_order to isPanding true
    await prisma.massschuhe_order.update({
      where: { id: orderId },
      data: { isPanding: true, production_startedAt: new Date() },
    });

    // Create transition record
    try {
      await prisma.admin_order_transitions.create({
        data: {
          massschuhe_order_id: orderId,
          partnerId: userId,
          catagoary: "Halbprobenerstellung",
          price: adminOrder.totalPrice,
          note: "Halbprobenerstellung send to admin",
        },
      });
    } catch (transitionError: any) {
      console.error("Database error creating transition:", transitionError);
      // Don't fail the whole request if transition creation fails
      console.warn(
        "Warning: Failed to create transition record, but order was created successfully"
      );
    }

    // Images are already S3 URLs, use directly
    const formatImage = (s3Url: string | null) => s3Url || null;

    return res.status(200).json({
      success: true,
      message: "Order sent to admin 1 successfully",
      data: {
        ...adminOrder,
        image3d_1: formatImage(adminOrder.image3d_1),
        image3d_2: formatImage(adminOrder.image3d_2),
        invoice: formatImage(adminOrder.invoice),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const sendToAdminOrder_2 = async (req, res) => {
  const files = req.files as any;
  const { id } = req.user;
  const { orderId } = req.params;

  try {
    // Get order and validate
    const order = await prisma.massschuhe_order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        customerId: true,
        customer: {
          select: {
            customerNumber: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    await prisma.massschuhe_order.update({
      where: { id: orderId },
      data: { isPanding: true },
    });

    // Check if order already sent to admin 2
    const isOrderSent = await prisma.custom_shafts.findFirst({
      where: {
        massschuhe_order_id: orderId,
        catagoary: "Massschafterstellung",
        isCompleted: false,
      },
    });

    // if (isOrderSent) {
    //   return res.status(400).json({
    //     success: false,
    //     message:
    //       "Order already sent to production. Please wait for complete the order.",
    //   });
    // }

    // Get customer from order
    if (!order.customerId) {
      return res.status(400).json({
        success: false,
        message: "Order does not have a customer associated",
      });
    }

    const {
      mabschaftKollektionId,
      lederfarbe,
      innenfutter,
      schafthohe,
      polsterung,
      vestarkungen,
      polsterung_text,
      vestarkungen_text,
      nahtfarbe,
      nahtfarbe_text,
      lederType,
      osen_einsetzen_price,
      Passenden_schnursenkel_price,
      maßschaftKollektionId,
      leatherType,
      // Common fields for Massschafterstellung and Bodenkonstruktion
      Konstruktionsart,
      Fersenkappe,
      Farbauswahl_Bodenkonstruktion,
      Sohlenmaterial,
      Absatz_Höhe,
      Absatz_Form,
      Abrollhilfe_Rolle,
      Laufsohle_Profil_Art,
      Sohlenstärke,
      Besondere_Hinweise,
      totalPrice,
    } = req.body;

    if (!mabschaftKollektionId) {
      return res.status(400).json({
        success: false,
        message: "maßschaftKollektionId must be provided",
      });
    }

    // Validate customer and kollektion
    const [customer, kollektion] = await Promise.all([
      prisma.customers.findUnique({
        where: { id: order.customerId },
        select: { id: true },
      }),
      prisma.maßschaft_kollektion.findUnique({
        where: { id: mabschaftKollektionId },
        select: { id: true },
      }),
    ]);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (!kollektion) {
      return res.status(404).json({
        success: false,
        message: "Maßschaft Kollektion not found",
      });
    }

    // Parse leatherType if it's a string (JSON)
    let parsedLeatherType = null;
    if (leatherType) {
      try {
        parsedLeatherType =
          typeof leatherType === "string"
            ? JSON.parse(leatherType)
            : leatherType;
      } catch (e) {
        console.warn("Failed to parse leatherType as JSON:", e);
        parsedLeatherType = leatherType;
      }
    }

    // Prepare data object
    const shaftData: any = {
      massschuhe_order_id: orderId,
      partnerId: id,
      customerId: order.customerId,
      image3d_1: files.image3d_1?.[0]?.filename || null,
      image3d_2: files.image3d_2?.[0]?.filename || null,
      paintImage: files.paintImage?.[0]?.filename || null,
      invoice2: files.invoice2?.[0]?.filename || null,
      invoice: files.invoice?.[0]?.filename || null,
      other_customer_number: order.customer?.customerNumber
        ? String(order.customer.customerNumber)
        : null,
      lederfarbe: lederfarbe || null,
      innenfutter: innenfutter || null,
      schafthohe: schafthohe || null,
      polsterung: polsterung || null,
      vestarkungen: vestarkungen || null,
      polsterung_text: polsterung_text || null,
      vestarkungen_text: vestarkungen_text || null,
      nahtfarbe: nahtfarbe || null,
      nahtfarbe_text: nahtfarbe_text || null,
      lederType: lederType || null,
      leatherType: parsedLeatherType,
      // Common fields for Massschafterstellung and Bodenkonstruktion
      Konstruktionsart: Konstruktionsart || null,
      Fersenkappe: Fersenkappe || null,
      Farbauswahl_Bodenkonstruktion: Farbauswahl_Bodenkonstruktion || null,
      Sohlenmaterial: Sohlenmaterial || null,
      Absatz_Höhe: Absatz_Höhe || null,
      Absatz_Form: Absatz_Form || null,
      Abrollhilfe_Rolle: Abrollhilfe_Rolle || null,
      Laufsohle_Profil_Art: Laufsohle_Profil_Art || null,
      Sohlenstärke: Sohlenstärke || null,
      Besondere_Hinweise: Besondere_Hinweise || null,
      totalPrice: totalPrice ? parseFloat(totalPrice) : null,
      orderNumber: `MS-${new Date().getFullYear()}-${Math.floor(
        10000 + Math.random() * 90000
      )}`,
      status: "Neu" as any,
      osen_einsetzen_price: osen_einsetzen_price
        ? parseFloat(osen_einsetzen_price)
        : null,
      Passenden_schnursenkel_price: Passenden_schnursenkel_price
        ? parseFloat(Passenden_schnursenkel_price)
        : null,
      catagoary: "Massschafterstellung",
      isCompleted: false,
      maßschaftKollektionId: mabschaftKollektionId,
    };

    // Create the custom shaft
    const customShaft = await prisma.custom_shafts.create({
      data: shaftData,
      include: {
        customer: {
          select: {
            id: true,
            vorname: true,
            nachname: true,
            email: true,
          },
        },
        maßschaft_kollektion: {
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // create a transition
    await prisma.admin_order_transitions.create({
      data: {
        massschuhe_order_id: orderId,
        partnerId: id,
        catagoary: "Massschafterstellung",
        //totalPrice
        price: customShaft.totalPrice,
        note: "Massschafterstellung send to admin",
      },
    });

    // Images are already S3 URLs, use directly
    const formatImage = (s3Url: string | null) => s3Url || null;

    const formattedCustomShaft = {
      ...customShaft,
      image3d_1: formatImage(customShaft.image3d_1),
      image3d_2: formatImage(customShaft.image3d_2),
      paintImage: formatImage(customShaft.paintImage),
      invoice2: formatImage(customShaft.invoice2),
      invoice: formatImage(customShaft.invoice),
      maßschaft_kollektion: customShaft.maßschaft_kollektion
        ? {
            ...customShaft.maßschaft_kollektion,
            image: formatImage(customShaft.maßschaft_kollektion.image),
          }
        : null,
      partner: customShaft.user
        ? {
            ...customShaft.user,
            image: formatImage(customShaft.user.image),
          }
        : null,
    };

    const { user, ...finalFormattedShaft } = formattedCustomShaft;

    // Send response immediately
    res.status(201).json({
      success: true,
      message: "Custom shaft created successfully",
      data: finalFormattedShaft,
    });
  } catch (err: any) {
    console.error("Create Custom Shaft Error:", err);

    // File cleanup (non-blocking)
    if (files) {
      Object.keys(files).forEach((key) => {
        files[key].forEach((file: any) => {
          fs.unlink(file.path, (error) => {
            if (error)
              console.error(`Failed to delete file ${file.path}`, error);
          });
        });
      });
    }

    if (err.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID or Maßschaft Kollektion ID provided",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};

export const sendToAdminOrder_3 = async (req, res) => {
  try {
    const { id } = req.user;
    const files = req.files as any;
    const invoice = files?.invoice?.[0]?.filename || null;
    const staticImage = files?.staticImage?.[0]?.filename || null;
    const orderId = req.params.orderId;

    const {
      Konstruktionsart,
      Fersenkappe,
      Farbauswahl_Bodenkonstruktion,
      Sohlenmaterial,
      Absatz_Höhe,
      Absatz_Form,
      Abrollhilfe_Rolle,
      Laufsohle_Profil_Art,
      Sohlenstärke,
      Besondere_Hinweise,
      staticName,
      description,
      totalPrice,
    } = req.body;

    const order = await prisma.massschuhe_order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const adminOrder = await prisma.custom_shafts.create({
      data: {
        massschuhe_order_id: orderId,
        partnerId: id,
        invoice: invoice,
        staticImage: staticImage,
        staticName: staticName || null,
        description: description || null,
        Konstruktionsart: Konstruktionsart || null,
        Fersenkappe: Fersenkappe || null,
        Farbauswahl_Bodenkonstruktion: Farbauswahl_Bodenkonstruktion || null,
        Sohlenmaterial: Sohlenmaterial || null,
        Absatz_Höhe: Absatz_Höhe || null,
        Absatz_Form: Absatz_Form || null,
        Abrollhilfe_Rolle: Abrollhilfe_Rolle || null,
        Laufsohle_Profil_Art: Laufsohle_Profil_Art || null,
        Sohlenstärke: Sohlenstärke || null,
        Besondere_Hinweise: Besondere_Hinweise || null,
        totalPrice: totalPrice ? parseFloat(totalPrice) : null,
        isCompleted: false,
        catagoary: "Bodenkonstruktion",
      },
      select: {
        id: true,
        invoice: true,
        staticImage: true,
        staticName: true,
        description: true,
        Konstruktionsart: true,
        Fersenkappe: true,
        Farbauswahl_Bodenkonstruktion: true,
        Sohlenmaterial: true,
        Absatz_Höhe: true,
        Absatz_Form: true,
        Abrollhilfe_Rolle: true,
        Laufsohle_Profil_Art: true,
        Sohlenstärke: true,
        Besondere_Hinweise: true,
        totalPrice: true,
        isCompleted: true,
        catagoary: true,
      },
    });

    // Images are already S3 URLs, use directly
    const formatImage = (s3Url: string | null) => s3Url || null;

    const formattedAdminOrder = {
      id: adminOrder.id,
      invoice: formatImage(adminOrder.invoice),
      staticImage: formatImage(adminOrder.staticImage),
      staticName: adminOrder.staticName,
      description: adminOrder.description,
      Konstruktionsart: adminOrder.Konstruktionsart,
      Fersenkappe: adminOrder.Fersenkappe,
      Farbauswahl_Bodenkonstruktion: adminOrder.Farbauswahl_Bodenkonstruktion,
      Sohlenmaterial: adminOrder.Sohlenmaterial,
      Absatz_Höhe: adminOrder.Absatz_Höhe,
      Absatz_Form: adminOrder.Absatz_Form,
      Abrollhilfe_Rolle: adminOrder.Abrollhilfe_Rolle,
      Laufsohle_Profil_Art: adminOrder.Laufsohle_Profil_Art,
      Sohlenstärke: adminOrder.Sohlenstärke,
      Besondere_Hinweise: adminOrder.Besondere_Hinweise,
      totalPrice: adminOrder.totalPrice,
      isCompleted: adminOrder.isCompleted,
      catagoary: adminOrder.catagoary,
    };

    await prisma.massschuhe_order.update({
      where: { id: orderId },
      data: { isPanding: true },
    });

    await prisma.admin_order_transitions.create({
      data: {
        massschuhe_order_id: orderId,
        partnerId: id,
        catagoary: "Bodenkonstruktion",
        price: adminOrder.totalPrice,
        note: "Bodenkonstruktion send to admin",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Order sent to admin 3 successfully",
      data: formattedAdminOrder,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getAllAdminOrders = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = req.query.status;
    const catagoary = req.query.catagoary;
    const skip = (page - 1) * limit;

    const whereCondition: any = {};

    const validStatuses = [
      "Bestellung_eingegangen",
      "In_Produktion",
      "Qualitätskontrolle",
      "Versandt",
      "Ausgeführt",
    ] as const;

    const validCatagoaries = [
      "Halbprobenerstellung",
      "Massschafterstellung",
      "Bodenkonstruktion",
    ] as const;

    // Safe status validation
    if (status && !validStatuses.includes(status.toString() as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
        validStatuses: validStatuses,
      });
    }

    // Safe catagoary validation
    if (catagoary && !validCatagoaries.includes(catagoary.toString() as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid catagoary value",
        validCatagoaries: validCatagoaries,
      });
    }

    if (status) {
      whereCondition.status = status;
    }

    if (catagoary) {
      whereCondition.catagoary = catagoary;
    }

    // Build search conditions based on category
    if (search) {
      const searchConditions: any[] = [
        {
          customer: {
            OR: [
              { vorname: { contains: search, mode: "insensitive" } },
              { nachname: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { telefon: { contains: search, mode: "insensitive" } },
              { ort: { contains: search, mode: "insensitive" } },
              { land: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        {
          maßschaft_kollektion: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { catagoary: { contains: search, mode: "insensitive" } },
              { gender: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        {
          user: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        { orderNumber: { contains: search, mode: "insensitive" } },
        { other_customer_number: { contains: search, mode: "insensitive" } },
      ];

      // Add category-specific search fields
      if (catagoary === "Halbprobenerstellung") {
        searchConditions.push(
          { Bettungsdicke: { contains: search, mode: "insensitive" } },
          { Haertegrad_Shore: { contains: search, mode: "insensitive" } },
          { Fersenschale: { contains: search, mode: "insensitive" } },
          { Laengsgewölbestütze: { contains: search, mode: "insensitive" } },
          {
            Palotte_oder_Querpalotte: { contains: search, mode: "insensitive" },
          },
          {
            Korrektur_der_Fußstellung: {
              contains: search,
              mode: "insensitive",
            },
          },
          { Zehenelemente_Details: { contains: search, mode: "insensitive" } },
          {
            eine_korrektur_nötig_ist: { contains: search, mode: "insensitive" },
          },
          { Spezielles_Fußproblem: { contains: search, mode: "insensitive" } },
          {
            Zusatzkorrektur_Absatzerhöhung: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            Vertiefungen_Aussparungen: {
              contains: search,
              mode: "insensitive",
            },
          },
          { Oberfläche_finish: { contains: search, mode: "insensitive" } },
          { Überzug_Stärke: { contains: search, mode: "insensitive" } },
          {
            Anmerkungen_zur_Bettung: { contains: search, mode: "insensitive" },
          },
          {
            Leisten_mit_ohne_Platzhalter: {
              contains: search,
              mode: "insensitive",
            },
          },
          { Schuhleisten_Typ: { contains: search, mode: "insensitive" } },
          { Material_des_Leisten: { contains: search, mode: "insensitive" } },
          { Absatzhöhe: { contains: search, mode: "insensitive" } },
          { Abrollhilfe: { contains: search, mode: "insensitive" } },
          {
            Spezielle_Fußprobleme_Leisten: {
              contains: search,
              mode: "insensitive",
            },
          },
          { Anmerkungen_zum_Leisten: { contains: search, mode: "insensitive" } }
        );
      } else if (catagoary === "Massschafterstellung") {
        searchConditions.push(
          { lederfarbe: { contains: search, mode: "insensitive" } },
          { innenfutter: { contains: search, mode: "insensitive" } },
          { schafthohe: { contains: search, mode: "insensitive" } },
          { polsterung: { contains: search, mode: "insensitive" } },
          { vestarkungen: { contains: search, mode: "insensitive" } },
          { polsterung_text: { contains: search, mode: "insensitive" } },
          { vestarkungen_text: { contains: search, mode: "insensitive" } },
          { nahtfarbe: { contains: search, mode: "insensitive" } },
          { nahtfarbe_text: { contains: search, mode: "insensitive" } },
          { lederType: { contains: search, mode: "insensitive" } },
          { Konstruktionsart: { contains: search, mode: "insensitive" } },
          { Fersenkappe: { contains: search, mode: "insensitive" } },
          {
            Farbauswahl_Bodenkonstruktion: {
              contains: search,
              mode: "insensitive",
            },
          },
          { Sohlenmaterial: { contains: search, mode: "insensitive" } },
          { Absatz_Höhe: { contains: search, mode: "insensitive" } },
          { Absatz_Form: { contains: search, mode: "insensitive" } },
          { Abrollhilfe_Rolle: { contains: search, mode: "insensitive" } },
          { Laufsohle_Profil_Art: { contains: search, mode: "insensitive" } },
          { Sohlenstärke: { contains: search, mode: "insensitive" } },
          { Besondere_Hinweise: { contains: search, mode: "insensitive" } }
        );
      } else if (catagoary === "Bodenkonstruktion") {
        searchConditions.push(
          { Konstruktionsart: { contains: search, mode: "insensitive" } },
          { Fersenkappe: { contains: search, mode: "insensitive" } },
          {
            Farbauswahl_Bodenkonstruktion: {
              contains: search,
              mode: "insensitive",
            },
          },
          { Sohlenmaterial: { contains: search, mode: "insensitive" } },
          { Absatz_Höhe: { contains: search, mode: "insensitive" } },
          { Absatz_Form: { contains: search, mode: "insensitive" } },
          { Abrollhilfe_Rolle: { contains: search, mode: "insensitive" } },
          { Laufsohle_Profil_Art: { contains: search, mode: "insensitive" } },
          { Sohlenstärke: { contains: search, mode: "insensitive" } },
          { Besondere_Hinweise: { contains: search, mode: "insensitive" } },
          { staticName: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } }
        );
      } else {
        // No category filter - search all fields
        searchConditions.push(
          { lederfarbe: { contains: search, mode: "insensitive" } },
          { innenfutter: { contains: search, mode: "insensitive" } },
          { schafthohe: { contains: search, mode: "insensitive" } },
          { polsterung: { contains: search, mode: "insensitive" } },
          { vestarkungen: { contains: search, mode: "insensitive" } },
          { polsterung_text: { contains: search, mode: "insensitive" } },
          { vestarkungen_text: { contains: search, mode: "insensitive" } },
          { nahtfarbe: { contains: search, mode: "insensitive" } },
          { nahtfarbe_text: { contains: search, mode: "insensitive" } },
          { lederType: { contains: search, mode: "insensitive" } },
          { Bettungsdicke: { contains: search, mode: "insensitive" } },
          { Haertegrad_Shore: { contains: search, mode: "insensitive" } },
          { Fersenschale: { contains: search, mode: "insensitive" } },
          { Laengsgewölbestütze: { contains: search, mode: "insensitive" } },
          { Konstruktionsart: { contains: search, mode: "insensitive" } },
          { Fersenkappe: { contains: search, mode: "insensitive" } }
        );
      }

      whereCondition.OR = searchConditions;
    }

    // Build select fields based on category
    const commonFields = {
      id: true,
      orderNumber: true,
      other_customer_number: true,
      customerId: true,
      invoice: true,
      totalPrice: true,
      image3d_1: true,
      image3d_2: true,
      status: true,
      catagoary: true,
      isCompleted: true,
      createdAt: true,
      updatedAt: true,
      partnerId: true,
      massschuhe_order_id: true,
    };

    const halbprobenerstellungFields = {
      Bettungsdicke: true,
      Haertegrad_Shore: true,
      Fersenschale: true,
      Laengsgewölbestütze: true,
      Palotte_oder_Querpalotte: true,
      Korrektur_der_Fußstellung: true,
      Zehenelemente_Details: true,
      eine_korrektur_nötig_ist: true,
      Spezielles_Fußproblem: true,
      Zusatzkorrektur_Absatzerhöhung: true,
      Vertiefungen_Aussparungen: true,
      Oberfläche_finish: true,
      Überzug_Stärke: true,
      Anmerkungen_zur_Bettung: true,
      Leisten_mit_ohne_Platzhalter: true,
      Schuhleisten_Typ: true,
      Material_des_Leisten: true,
      Leisten_gleiche_Länge: true,
      Absatzhöhe: true,
      Abrollhilfe: true,
      Spezielle_Fußprobleme_Leisten: true,
      Anmerkungen_zum_Leisten: true,
    };

    const massschafterstellungFields = {
      lederfarbe: true,
      innenfutter: true,
      schafthohe: true,
      polsterung: true,
      vestarkungen: true,
      vestarkungen_text: true,
      polsterung_text: true,
      osen_einsetzen_price: true,
      Passenden_schnursenkel_price: true,
      nahtfarbe: true,
      nahtfarbe_text: true,
      lederType: true,
      maßschaftKollektionId: true,
      paintImage: true,
      invoice2: true,
      leatherType: true,
      // Common fields for Massschafterstellung and Bodenkonstruktion
      Konstruktionsart: true,
      Fersenkappe: true,
      Farbauswahl_Bodenkonstruktion: true,
      Sohlenmaterial: true,
      Absatz_Höhe: true,
      Absatz_Form: true,
      Abrollhilfe_Rolle: true,
      Laufsohle_Profil_Art: true,
      Sohlenstärke: true,
      Besondere_Hinweise: true,
    };

    const bodenkonstruktionFields = {
      Konstruktionsart: true,
      Fersenkappe: true,
      Farbauswahl_Bodenkonstruktion: true,
      Sohlenmaterial: true,
      Absatz_Höhe: true,
      Absatz_Form: true,
      Abrollhilfe_Rolle: true,
      Laufsohle_Profil_Art: true,
      Sohlenstärke: true,
      Besondere_Hinweise: true,
      staticImage: true,
      staticName: true,
      description: true,
    };

    // Build select object based on category
    let selectFields: any = { ...commonFields };

    if (catagoary === "Halbprobenerstellung") {
      selectFields = { ...commonFields, ...halbprobenerstellungFields };
    } else if (catagoary === "Massschafterstellung") {
      selectFields = { ...commonFields, ...massschafterstellungFields };
    } else if (catagoary === "Bodenkonstruktion") {
      selectFields = { ...commonFields, ...bodenkonstruktionFields };
    } else {
      // No category filter - include all fields
      selectFields = {
        ...commonFields,
        ...halbprobenerstellungFields,
        ...massschafterstellungFields,
        ...bodenkonstruktionFields,
      };
    }

    const [totalCount, customShafts] = await Promise.all([
      prisma.custom_shafts.count({
        where: whereCondition,
      }),
      prisma.custom_shafts.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          ...selectFields,
          customer: {
            select: {
              id: true,
              customerNumber: true,
              vorname: true,
              nachname: true,
              email: true,
              telefon: true,
              ort: true,
              land: true,
              straße: true,
              geburtsdatum: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          maßschaft_kollektion: {
            select: {
              id: true,
              ide: true,
              name: true,
              price: true,
              image: true,
              catagoary: true,
              gender: true,
              description: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          massschuhe_order: {
            select: {
              id: true,
              isPanding: true,
            },
          },
        },
      }),
    ]);

    // Format response with image URLs
    // Images are already S3 URLs, use directly
    const formatImage = (s3Url: string | null) => s3Url || null;

    const formattedCustomShafts = customShafts.map((item: any) => {
      const { user, maßschaft_kollektion, customer, massschuhe_order, ...shaft } = item;

      const formatted: any = {
        ...shaft,
        // Format common images
        image3d_1: formatImage(shaft.image3d_1),
        image3d_2: formatImage(shaft.image3d_2),
        paintImage: formatImage(shaft.paintImage),
        invoice2: formatImage(shaft.invoice2),
        staticImage: formatImage(shaft.staticImage),
        // Include isPanding from massschuhe_order relation
        isPanding: massschuhe_order?.isPanding || false,
        // Format relations
        customer: customer || null,
      };

      // Remove massschuhe_order from formatted (we only need isPanding)

      // Format maßschaft_kollektion if it exists
      if (maßschaft_kollektion) {
        formatted.maßschaft_kollektion = {
          ...maßschaft_kollektion,
          image: formatImage(maßschaft_kollektion.image),
        };
      } else {
        formatted.maßschaft_kollektion = null;
      }

      // Format partner (user) if it exists
      if (user) {
        formatted.partner = {
          ...user,
          image: formatImage(user.image),
        };
      } else {
        formatted.partner = null;
      }

      return formatted;
    });

    // Calculate pagination values
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      message: "Custom shafts fetched successfully",
      data: formattedCustomShafts,
      pagination: {
        totalItems: totalCount,
        totalPages: totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: hasNextPage,
        hasPrevPage: hasPrevPage,
      },
    });
  } catch (error: any) {
    console.error("Get Custom Shafts Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching custom shafts",
      error: error.message,
    });
  }
};

export const getSingleAllAdminOrders = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Custom shaft ID is required",
      });
    }

    // First, get the category to determine which fields to select
    const categoryCheck = await prisma.custom_shafts.findUnique({
      where: { id },
      select: { catagoary: true },
    });

    if (!categoryCheck) {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    // Define field sets (same as getAllAdminOrders)
    const commonFields = {
      id: true,
      orderNumber: true,
      other_customer_number: true,
      customerId: true,
      invoice: true,
      totalPrice: true,
      image3d_1: true,
      image3d_2: true,
      status: true,
      catagoary: true,
      isCompleted: true,
      createdAt: true,
      updatedAt: true,
      partnerId: true,
      massschuhe_order_id: true,
    };

    const halbprobenerstellungFields = {
      Bettungsdicke: true,
      Haertegrad_Shore: true,
      Fersenschale: true,
      Laengsgewölbestütze: true,
      Palotte_oder_Querpalotte: true,
      Korrektur_der_Fußstellung: true,
      Zehenelemente_Details: true,
      eine_korrektur_nötig_ist: true,
      Spezielles_Fußproblem: true,
      Zusatzkorrektur_Absatzerhöhung: true,
      Vertiefungen_Aussparungen: true,
      Oberfläche_finish: true,
      Überzug_Stärke: true,
      Anmerkungen_zur_Bettung: true,
      Leisten_mit_ohne_Platzhalter: true,
      Schuhleisten_Typ: true,
      Material_des_Leisten: true,
      Leisten_gleiche_Länge: true,
      Absatzhöhe: true,
      Abrollhilfe: true,
      Spezielle_Fußprobleme_Leisten: true,
      Anmerkungen_zum_Leisten: true,
    };

    const massschafterstellungFields = {
      lederfarbe: true,
      innenfutter: true,
      schafthohe: true,
      polsterung: true,
      vestarkungen: true,
      vestarkungen_text: true,
      polsterung_text: true,
      osen_einsetzen_price: true,
      Passenden_schnursenkel_price: true,
      nahtfarbe: true,
      nahtfarbe_text: true,
      lederType: true,
      maßschaftKollektionId: true,
      paintImage: true,
      invoice2: true,
      leatherType: true,
      // Common fields for Massschafterstellung and Bodenkonstruktion
      Konstruktionsart: true,
      Fersenkappe: true,
      Farbauswahl_Bodenkonstruktion: true,
      Sohlenmaterial: true,
      Absatz_Höhe: true,
      Absatz_Form: true,
      Abrollhilfe_Rolle: true,
      Laufsohle_Profil_Art: true,
      Sohlenstärke: true,
      Besondere_Hinweise: true,
    };

    const bodenkonstruktionFields = {
      Konstruktionsart: true,
      Fersenkappe: true,
      Farbauswahl_Bodenkonstruktion: true,
      Sohlenmaterial: true,
      Absatz_Höhe: true,
      Absatz_Form: true,
      Abrollhilfe_Rolle: true,
      Laufsohle_Profil_Art: true,
      Sohlenstärke: true,
      Besondere_Hinweise: true,
      staticImage: true,
      staticName: true,
      description: true,
    };

    // Build select fields based on category
    let selectFields: any = { ...commonFields };

    if (categoryCheck.catagoary === "Halbprobenerstellung") {
      selectFields = { ...commonFields, ...halbprobenerstellungFields };
    } else if (categoryCheck.catagoary === "Massschafterstellung") {
      selectFields = { ...commonFields, ...massschafterstellungFields };
    } else if (categoryCheck.catagoary === "Bodenkonstruktion") {
      selectFields = { ...commonFields, ...bodenkonstruktionFields };
    } else {
      // No category or unknown category - include all fields
      selectFields = {
        ...commonFields,
        ...halbprobenerstellungFields,
        ...massschafterstellungFields,
        ...bodenkonstruktionFields,
      };
    }

    // Fetch the custom shaft with category-specific fields
    const customShaft = await prisma.custom_shafts.findUnique({
      where: { id },
      select: {
        ...selectFields,
        customer: {
          select: {
            id: true,
            customerNumber: true,
            vorname: true,
            nachname: true,
            email: true,
            telefon: true,
            ort: true,
            land: true,
            straße: true,
            geburtsdatum: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        maßschaft_kollektion: {
          select: {
            id: true,
            ide: true,
            name: true,
            price: true,
            image: true,
            catagoary: true,
            gender: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        massschuhe_order: {
          select: {
            id: true,
            isPanding: true,
          },
        },
      },
    });

    if (!customShaft) {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    // Images are already S3 URLs, use directly
    const formatImage = (s3Url: string | null) => s3Url || null;

    // Format the response
    const shaftData: any = customShaft;
    const formattedShaft: any = {
      ...shaftData,
      // Format common images
      image3d_1: formatImage(shaftData.image3d_1),
      image3d_2: formatImage(shaftData.image3d_2),
      paintImage: formatImage(shaftData.paintImage),
      invoice2: formatImage(shaftData.invoice2),
      staticImage: formatImage(shaftData.staticImage),
      // Include isPanding from massschuhe_order relation
      isPanding: shaftData.massschuhe_order?.isPanding || false,
      // Format relations
      customer: shaftData.customer || null,
    };

    // Format maßschaft_kollektion if it exists
    if (shaftData.maßschaft_kollektion) {
      const kollektion: any = shaftData.maßschaft_kollektion;
      formattedShaft.maßschaft_kollektion = {
        ...kollektion,
        image: formatImage(kollektion.image),
      };
    } else {
      formattedShaft.maßschaft_kollektion = null;
    }

    // Format partner (user) if it exists
    if (shaftData.user) {
      const user: any = shaftData.user;
      formattedShaft.partner = {
        ...user,
        image: formatImage(user.image),
      };
    } else {
      formattedShaft.partner = null;
    }

    // Remove user and massschuhe_order fields (we use partner and isPanding instead)
    delete formattedShaft.user;
    delete formattedShaft.massschuhe_order;

    res.status(200).json({
      success: true,
      message: "Custom shaft fetched successfully",
      data: formattedShaft,
    });
  } catch (error: any) {
    console.error("Get Single Custom Shaft Error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching the custom shaft",
      error: error.message,
    });
  }
};
