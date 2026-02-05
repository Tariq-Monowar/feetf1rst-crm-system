import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { Readable } from "stream";
import iconv from "iconv-lite";
import csvParser from "csv-parser";
import { deleteFileFromS3, deleteMultipleFilesFromS3, downloadFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

const COMPLETED_ORDER_STATUSES: any = [
  "Ausgeführte_Einlagen",
  "Einlage_versandt",
  "Einlage_Abholbereit",
];

const targetCells = [
  "B58", // fusslange1
  "C58", // fusslange2
  "B73", // fussbreite1
  "C73", // fussbreite2
  "B102", // kugelumfang1
  "C102", // kugelumfang2
  "B105", // rist1
  "C105", // rist2
  "B136", // zehentyp1
  "C136", // zehentyp2
  "B120", // archIndex1
  "C120", // archIndex2
];

const serializeMaterialField = (material: any): string => {
  if (Array.isArray(material)) {
    return material
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter((item) => item.length > 0)
      .join(", ");
  }

  if (typeof material === "string") {
    return material;
  }

  return material !== undefined && material !== null ? String(material) : "";
};

// Get next customer number for a partner (starts from 1000)
const getNextCustomerNumberForPartner = async (
  tx: any,
  partnerId: string
): Promise<number> => {
  const maxCustomer = await tx.customers.findFirst({
    where: { partnerId },
    orderBy: { customerNumber: "desc" },
    select: { customerNumber: true },
  });
  return maxCustomer ? maxCustomer.customerNumber + 1 : 1000;
};

async function parseCSV(csvS3Url: string): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("Parsing CSV file from S3:", csvS3Url);
      const results: any = {};
      let currentRow = 0;

      // Download file from S3
      const csvBuffer = await downloadFileFromS3(csvS3Url);
      
      // Create a readable stream from the buffer
      const stream = Readable.from(csvBuffer);

      stream
        .pipe(iconv.decodeStream("utf16le"))
        .pipe(csvParser({ separator: "\t", headers: false }))
        .on("data", (row) => {
          currentRow++;
          targetCells.forEach((cell) => {
            const col = cell.charAt(0);
            const rowNum = parseInt(cell.slice(1));
            if (currentRow === rowNum) {
              const colIndex = col === "B" ? 1 : 2;
              results[cell] = row[colIndex] || null;
            }
          });
        })
        .on("end", () => resolve(results))
        .on("error", (err) => reject(err));
    } catch (error) {
      reject(error);
    }
  });
}

export const createCustomers = async (req: Request, res: Response) => {
  console.log("createCustomers", req.body);
  const files = req.files as any;

  const cleanupFiles = () => {
    if (!files) return;
    Object.keys(files).forEach((key) => {
      files[key].forEach((file: any) => {
        if (file.location) {
          // Delete from S3 if file was uploaded
          deleteFileFromS3(file.location);
        }
      });
    });
  };

  // Validate user is authenticated
  if (!req.user?.id) {
    cleanupFiles();
    return res.status(401).json({
      success: false,
      message: "Unauthorized: user not authenticated",
    });
  }

  const requireFields = await prisma.customer_requirements.findFirst({
    where: {
      partnerId: req.user.id,
    },
    select: {
      vorname: true,
      nachname: true,
      geburtsdatum: true,
      email: true,
      telefon: true,
      adresse: true,
      land: true,
      billingType: true,
    },
  });

  const bodyFieldMap = {
    vorname: req.body.vorname,
    nachname: req.body.nachname,
    geburtsdatum: req.body.geburtsdatum,
    email: req.body.email,
    telefon: req.body.telefon,
    adresse: req.body.wohnort,
    land: req.body.land,
    billingType: req.body.billingType,
  };

  const missingFields: string[] = [];

  // Only validate required fields if requireFields exists
  if (requireFields) {
    for (const [field, isRequired] of Object.entries(requireFields)) {
      if (isRequired && !bodyFieldMap[field as keyof typeof bodyFieldMap]) {
        missingFields.push(field);
      }
    }
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  try {
    const {
      vorname,
      nachname,
      email,
      telefon,
      wohnort,
      ausfuhrliche_diagnose,
      kundeSteuernummer,
      diagnose,
      kodexeMassschuhe,
      kodexeEinlagen,
      sonstiges,
      geburtsdatum,
      billingType,
      gender,
      land,
      ort,
      straße,
    } = req.body;

    const existingCustomer = await prisma.customers.findUnique({
      where: { email },
    });
    if (existingCustomer) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    let csvData: any = {};
    let csvS3Url: string | null = null;
    if (files.csvFile && files.csvFile[0]) {
      csvS3Url = files.csvFile[0].location;
      if (csvS3Url) {
        csvData = await parseCSV(csvS3Url);
      }
    }
    let screenerFileId = null;

    const customerWithScreener = await prisma.$transaction(async (tx) => {
      const customerNumber = await getNextCustomerNumberForPartner(
        tx,
        req.user.id
      );

      const newCustomer = await tx.customers.create({
        data: {
          vorname,
          nachname,
          email,
          customerNumber,
          telefon: telefon || null,
          wohnort: wohnort || null,
          ausfuhrliche_diagnose: ausfuhrliche_diagnose || null,
          kundeSteuernummer: kundeSteuernummer || null,
          diagnose: diagnose || null,
          kodexeMassschuhe: kodexeMassschuhe || null,
          kodexeEinlagen: kodexeEinlagen || null,
          sonstiges: sonstiges || null,
          fusslange1: csvData.B58 || null,
          fusslange2: csvData.C58 || null,
          fussbreite1: csvData.B73 || null,
          fussbreite2: csvData.C73 || null,
          kugelumfang1: csvData.B102 || null,
          kugelumfang2: csvData.C102 || null,
          rist1: csvData.B105 || null,
          rist2: csvData.C105 || null,
          archIndex1: csvData.B120 || null,
          archIndex2: csvData.C120 || null,
          zehentyp1: csvData.B136 || null,
          zehentyp2: csvData.C136 || null,
          partnerId: req.user.id,
          updatedBy: null,
          geburtsdatum: geburtsdatum || null,
          billingType: billingType || null,
          gender: gender || null,
          land: land || null,
          ort: ort || null,
          straße: straße || null,
        },
      });

      let screenerFile = null;
      if (
        files.picture_10 ||
        files.picture_23 ||
        files.paint_24 ||
        files.paint_23 ||
        files.threed_model_left ||
        files.picture_17 ||
        files.picture_11 ||
        files.picture_24 ||
        files.threed_model_right ||
        files.picture_16 ||
        csvS3Url
      ) {
        screenerFile = await tx.screener_file.create({
          data: {
            customerId: newCustomer.id,
            picture_10: files.picture_10?.[0]?.location || null,
            picture_23: files.picture_23?.[0]?.location || null,
            paint_24: files.paint_24?.[0]?.location || null,
            paint_23: files.paint_23?.[0]?.location || null,
            threed_model_left: files.threed_model_left?.[0]?.location || null,
            picture_17: files.picture_17?.[0]?.location || null,
            picture_11: files.picture_11?.[0]?.location || null,
            picture_24: files.picture_24?.[0]?.location || null,
            threed_model_right: files.threed_model_right?.[0]?.location || null,
            picture_16: files.picture_16?.[0]?.location || null,
            csvFile: csvS3Url,
            fusslange1: csvData.B58 || null,
            fusslange2: csvData.C58 || null,
            fussbreite1: csvData.B73 || null,
            fussbreite2: csvData.C73 || null,
            kugelumfang1: csvData.B102 || null,
            kugelumfang2: csvData.C102 || null,
            rist1: csvData.B105 || null,
            rist2: csvData.C105 || null,
            archIndex1: csvData.B120 || null,
            archIndex2: csvData.C120 || null,
            zehentyp1: csvData.B136 || null,
            zehentyp2: csvData.C136 || null,
          },
        });
        screenerFileId = screenerFile.id;
      }

      await tx.customerHistorie.create({
        data: {
          customerId: newCustomer.id,
          category: "Leistungen",
          url: `/customers/screener-file/${screenerFileId}`,
          methord: "GET",
          eventId: newCustomer.id,
          system_note: "Fußscan",
        },
      });

      return {
        ...newCustomer,
        screenerFile: screenerFile ? [screenerFile] : [],
      };
    });

    // if (csvFileName && files.csvFile?.[0]?.path) {
    //   try {
    //     fs.unlinkSync(files.csvFile[0].path);
    //   } catch (err) {
    //     console.error(
    //       `Failed to delete CSV file ${files.csvFile[0].path}`,
    //       err
    //     );
    //   }
    // }

    // console.log("Customer created successfully:", customerWithScreener);

    const customerWithImages = {
      ...customerWithScreener,
      screenerFile: customerWithScreener.screenerFile.map((screener) => ({
        id: screener.id,
        customerId: screener.customerId,
        picture_10: screener.picture_10 || null,
        picture_23: screener.picture_23 || null,
        paint_24: screener.paint_24 || null,
        paint_23: screener.paint_23 || null,
        picture_11: screener.picture_11 || null,
        picture_24: screener.picture_24 || null,
        threed_model_left: screener.threed_model_left || null,
        threed_model_right: screener.threed_model_right || null,
        picture_17: screener.picture_17 || null,
        picture_16: screener.picture_16 || null,
        csvFile: screener.csvFile || null,
        createdAt: screener.createdAt,
        updatedAt: screener.updatedAt,
        fusslange1: screener.fusslange1,
        fusslange2: screener.fusslange2,
        fussbreite1: screener.fussbreite1,
        fussbreite2: screener.fussbreite2,
        kugelumfang1: screener.kugelumfang1,
        kugelumfang2: screener.kugelumfang2,
        rist1: screener.rist1,
        rist2: screener.rist2,
        archIndex1: screener.archIndex1,
        archIndex2: screener.archIndex2,
        zehentyp1: screener.zehentyp1,
        zehentyp2: screener.zehentyp2,
      })),
    };

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: customerWithImages,
    });
  } catch (err: any) {
    console.error("Create Customer Error:", err);
    cleanupFiles();
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};

// export const createCustomers = async (req: Request, res: Response) => {
//   const files = req.files as any;

//   const cleanupFiles = () => {
//     if (!files) return;
//     Object.keys(files).forEach((key) => {
//       files[key].forEach((file: any) => {
//         try {
//           fs.unlinkSync(file.path);
//         } catch (err) {
//           console.error(`Failed to delete file ${file.path}`, err);
//         }
//       });
//     });
//   };

//   try {
//     const missingField = ["vorname", "nachname", "email"].find(
//       (field) => !req.body[field]
//     );
//     if (missingField) {
//       return res.status(400).json({
//         success: false,
//         message: `${missingField} is required!`,
//       });
//     }

//     const {
//       vorname,
//       nachname,
//       email,
//       telefonnummer,
//       wohnort,
//       ausfuhrliche_diagnose,
//       kundeSteuernummer,
//       diagnose,
//       kodexeMassschuhe,
//       kodexeEinlagen,
//       sonstiges,
//     } = req.body;

//     const existingCustomer = await prisma.customers.findUnique({
//       where: { email },
//     });
//     if (existingCustomer) {
//       cleanupFiles();
//       return res.status(400).json({
//         success: false,
//         message: "Email already exists",
//       });
//     }

//     let csvData: any = {};
//     let csvFileName: string | null = null;
//     if (files.csvFile && files.csvFile[0]) {
//       const csvPath = files.csvFile[0].path;
//       csvFileName = files.csvFile[0].filename;
//       console.log("Parsing CSV file:", csvPath);
//       csvData = await parseCSV(csvPath);
//     }
//     let screenerFileId = null;

//     const customer = await prisma.$transaction(async (tx) => {
//       const newCustomer = await tx.customers.create({
//         data: {
//           vorname,
//           nachname,
//           email,
//           telefonnummer: telefonnummer || null,
//           wohnort: wohnort || null,
//           ausfuhrliche_diagnose: ausfuhrliche_diagnose || null,
//           kundeSteuernummer: kundeSteuernummer || null,
//           diagnose: diagnose || null,
//           kodexeMassschuhe: kodexeMassschuhe || null,
//           kodexeEinlagen: kodexeEinlagen || null,
//           sonstiges: sonstiges || null,
//           fusslange1: csvData.B58 || null,
//           fusslange2: csvData.C58 || null,
//           fussbreite1: csvData.B73 || null,
//           fussbreite2: csvData.C73 || null,
//           kugelumfang1: csvData.B102 || null,
//           kugelumfang2: csvData.C102 || null,
//           rist1: csvData.B105 || null,
//           rist2: csvData.C105 || null,
//           archIndex1: csvData.B120 || null,
//           archIndex2: csvData.C120 || null,
//           zehentyp1: csvData.B136 || null,
//           zehentyp2: csvData.C136 || null,
//           createdBy: req.user.id,
//           updatedBy: null,
//         },
//       });

//       if (
//         files.picture_10 ||
//         files.picture_23 ||
//         files.threed_model_left ||
//         files.picture_17 ||
//         files.picture_11 ||
//         files.picture_24 ||
//         files.threed_model_right ||
//         files.picture_16 ||
//         csvFileName
//       ) {
//         const screenerFile = await tx.screener_file.create({
//           data: {
//             customerId: newCustomer.id,
//             picture_10: files.picture_10?.[0]?.filename || null,
//             picture_23: files.picture_23?.[0]?.filename || null,
//             threed_model_left: files.threed_model_left?.[0]?.filename || null,
//             picture_17: files.picture_17?.[0]?.filename || null,
//             picture_11: files.picture_11?.[0]?.filename || null,
//             picture_24: files.picture_24?.[0]?.filename || null,
//             threed_model_right: files.threed_model_right?.[0]?.filename || null,
//             picture_16: files.picture_16?.[0]?.filename || null,
//             csvFile: csvFileName,
//           },
//         });
//         screenerFileId = screenerFile.id;
//       }

//       // Create customer history with category "Leistungen" (Services)
//       await tx.customerHistorie.create({
//         data: {
//           customerId: newCustomer.id,
//           category: "Leistungen",
//           url: `/customers/screener-file/${screenerFileId}`,
//           methord: "GET",
//           eventId: newCustomer.id,
//         },
//       });

//       return newCustomer;
//     });

//     if (csvFileName && files.csvFile?.[0]?.path) {
//       try {
//         fs.unlinkSync(files.csvFile[0].path);
//       } catch (err) {
//         console.error(
//           `Failed to delete CSV file ${files.csvFile[0].path}`,
//           err
//         );
//       }
//     }

//     const customerWithScreener = await prisma.customers.findUnique({
//       where: { id: customer.id },
//       include: {
//         screenerFile: true,
//       },
//     });

//     // Simplified response formatting to ensure screenerFile is an array
//     const customerWithImages = {
//       ...customerWithScreener,
//       screenerFile: (customerWithScreener?.screenerFile || []).map(
//         (screener) => ({
//           id: screener.id,
//           customerId: screener.customerId,
//           picture_10: screener.picture_10
//             ? getImageUrl(`/uploads/${screener.picture_10}`)
//             : null,
//           picture_23: screener.picture_23
//             ? getImageUrl(`/uploads/${screener.picture_23}`)
//             : null,
//           picture_11: screener.picture_11
//             ? getImageUrl(`/uploads/${screener.picture_11}`)
//             : null,
//           picture_24: screener.picture_24
//             ? getImageUrl(`/uploads/${screener.picture_24}`)
//             : null,
//           threed_model_left: screener.threed_model_left
//             ? getImageUrl(`/uploads/${screener.threed_model_left}`)
//             : null,
//           threed_model_right: screener.threed_model_right
//             ? getImageUrl(`/uploads/${screener.threed_model_right}`)
//             : null,
//           picture_17: screener.picture_17
//             ? getImageUrl(`/uploads/${screener.picture_17}`)
//             : null,
//           picture_16: screener.picture_16
//             ? getImageUrl(`/uploads/${screener.picture_16}`)
//             : null,
//           csvFile: screener.csvFile
//             ? getImageUrl(`/uploads/${screener.csvFile}`)
//             : null,
//           createdAt: screener.createdAt,
//           updatedAt: screener.updatedAt,
//         })
//       ),
//     };

//     res.status(201).json({
//       success: true,
//       message: "Customer created successfully",
//       data: customerWithImages,
//     });
//   } catch (err: any) {
//     console.error("Create Customer Error:", err);
//     cleanupFiles();
//     res.status(500).json({
//       success: false,
//       message: "Something went wrong",
//       error: err.message,
//     });
//   }
// };

export const getAllCustomers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const partnerId = req.user?.id;

    const whereCondition: any = {};
    if (search) {
      whereCondition.OR = [
        { vorname: { contains: search, mode: "insensitive" } },
        { nachname: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [customers, totalCount] = await Promise.all([
      prisma.customers.findMany({
        where: {
          ...whereCondition,
          partnerId: partnerId,
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          versorgungen: true,
          screenerFile: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.customers.count({
        where: {
          ...whereCondition,
          partnerId: partnerId,
        },
      }),
    ]);

    const customersWithImages = customers.map((c) => ({
      ...c,
      screenerFile: c.screenerFile.map((screener) => ({
        id: screener.id,
        customerId: screener.customerId,
        picture_10: screener.picture_10 || null,
        picture_23: screener.picture_23 || null,
        paint_24: screener.paint_24 || null,
        paint_23: screener.paint_23 || null,
        picture_11: screener.picture_11 || null,
        picture_24: screener.picture_24 || null,
        threed_model_left: screener.threed_model_left || null,
        threed_model_right: screener.threed_model_right || null,
        picture_17: screener.picture_17 || null,
        picture_16: screener.picture_16 || null,
        csvFile: screener.csvFile || null,
        createdAt: screener.createdAt,
        updatedAt: screener.updatedAt,
      })),
    }));

    res.status(200).json({
      success: true,
      message: "Customers fetched successfully",
      data: customersWithImages,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    });
  } catch (error: any) {
    console.error("Get All Customers error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customers.findUnique({
      where: { id },
      include: {
        screenerFile: true,
        einlagenAnswers: true,
        versorgungen: true,
        customerOrders: {
          include: {
            product: true,
          },
        },
        custom_shafts: true,
        customer_files: true,
        StoresHistory: true,
      },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Delete all files from S3 (fire-and-forget, no await)
    // 1. Delete screener files
    customer.screenerFile.forEach((screener) => {
      const fileFields = [
        screener.picture_10,
        screener.picture_23,
        screener.picture_17,
        screener.picture_11,
        screener.picture_24,
        screener.picture_16,
        screener.threed_model_left,
        screener.threed_model_right,
        screener.csvFile,
      ];
      fileFields.forEach((file) => {
        if (file && file.startsWith("http")) {
          deleteFileFromS3(file);
        }
      });
    });

    // 2. Delete customer files
    customer.customer_files.forEach((file) => {
      if (file.url && file.url.startsWith("http")) {
        deleteFileFromS3(file.url);
      }
    });

    // 3. Delete order invoices
    customer.customerOrders.forEach((order) => {
      if (order.invoice && order.invoice.startsWith("http")) {
        deleteFileFromS3(order.invoice);
      }
    });

    // Delete all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete customer_versorgungen (no cascade)
      await tx.customer_versorgungen.deleteMany({
        where: { customerId: id },
      });

      // 2. Delete customerOrders and their related customerProduct
      for (const order of customer.customerOrders) {
        // Delete customerProduct if it exists
        if (order.productId) {
          await tx.customerProduct
            .delete({
              where: { id: order.productId },
            })
            .catch(() => {
              // Ignore if already deleted
            });
        }
      }
      await tx.customerOrders.deleteMany({
        where: { customerId: id },
      });

      // 3. Werkstattzettel model removed - data is now in customerOrders

      // 4. Delete custom_shafts (no cascade on customer relation)
      await tx.custom_shafts.deleteMany({
        where: { customerId: id },
      });

      // 5. Delete StoresHistory entries (SetNull, but we want to delete them)
      await tx.storesHistory.deleteMany({
        where: { customerId: id },
      });

      // 6. Delete customer_files (has cascade, but delete explicitly for safety)
      await tx.customer_files.deleteMany({
        where: { customerId: id },
      });

      // 7. Delete customerHistorie (has cascade, but delete explicitly for safety)
      await tx.customerHistorie.deleteMany({
        where: { customerId: id },
      });

      // 8. Delete einlagenAnswers (has cascade, but delete explicitly for safety)
      await tx.einlagenAnswers.deleteMany({
        where: { customerId: id },
      });

      // 9. Delete screener_file (has cascade, but delete explicitly for safety)
      await tx.screener_file.deleteMany({
        where: { customerId: id },
      });

      // 10. Finally, delete the customer
      await tx.customers.delete({
        where: { id },
      });
    });

    res.status(200).json({
      success: true,
      message: "Customer and all related data deleted successfully",
      data: {
        id,
      },
    });
  } catch (error: any) {
    console.error("Delete Customer Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.customers.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const {
      vorname,
      nachname,
      email,
      telefon,
      wohnort,
      fusslange1,
      fusslange2,
      fussbreite1,
      fussbreite2,
      kugelumfang1,
      kugelumfang2,
      rist1,
      rist2,
      zehentyp1,
      zehentyp2,
      archIndex1,
      archIndex2,
      ausfuhrliche_diagnose,
      kundeSteuernummer,
      diagnose,
      kodexeMassschuhe,
      kodexeEinlagen,
      sonstiges,
      einlagenversorgung,
      fußanalyse,
      gender,
      geburtsdatum,
      straße,
      land,
      ort,
      billingType,
    } = req.body;

    const updateData = {
      vorname: vorname || existing.vorname,
      nachname: nachname || existing.nachname,
      email: email || existing.email,
      // telefonnummer: telefonnummer || existing.telefonnummer,
      wohnort: wohnort || existing.wohnort,
      ausfuhrliche_diagnose:
        ausfuhrliche_diagnose || existing.ausfuhrliche_diagnose,
      kundeSteuernummer: kundeSteuernummer || existing.kundeSteuernummer,
      diagnose: diagnose || existing.diagnose,
      kodexeMassschuhe: kodexeMassschuhe || existing.kodexeMassschuhe,
      kodexeEinlagen: kodexeEinlagen || existing.kodexeEinlagen,
      sonstiges: sonstiges || existing.sonstiges,

      fusslange1: fusslange1 || existing.fusslange1,
      fusslange2: fusslange2 || existing.fusslange2,
      fussbreite1: fussbreite1 || existing.fussbreite1,
      fussbreite2: fussbreite2 || existing.fussbreite2,
      kugelumfang1: kugelumfang1 || existing.kugelumfang1,
      kugelumfang2: kugelumfang2 || existing.kugelumfang2,
      rist1: rist1 || existing.rist1,
      rist2: rist2 || existing.rist2,
      zehentyp1: zehentyp1 || existing.zehentyp1,
      zehentyp2: zehentyp2 || existing.zehentyp2,
      archIndex1: archIndex1 || existing.archIndex1,
      archIndex2: archIndex2 || existing.archIndex2,

      einlagenversorgung: einlagenversorgung || existing.einlagenversorgung,
      fußanalyse: fußanalyse || existing.fußanalyse,

      gender: gender ?? existing.gender,
      geburtsdatum: geburtsdatum ?? existing.geburtsdatum,
      straße: straße ?? existing.straße,
      land: land ?? existing.land,
      ort: ort ?? existing.ort,
      telefon: telefon ?? existing.telefon,
      billingType: billingType ?? existing.billingType,

      updatedBy: req.user.id,
    };

    const updatedCustomer = await prisma.customers.update({
      where: { id },
      data: updateData,
      include: { versorgungen: true },
    });

    res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      data: updatedCustomer,
    });
  } catch (err: any) {
    console.error("Update Customer Error:", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};

export const updateCustomerSpecialFields = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const {
      kundeSteuernummer,
      diagnose,
      kodexeMassschuhe,
      kodexeEinlagen,
      sonstiges,
    } = req.body;
    const existing = await prisma.customers.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }
    const updateData = {
      kundeSteuernummer: kundeSteuernummer || existing.kundeSteuernummer,
      diagnose: diagnose || existing.diagnose,
      kodexeMassschuhe: kodexeMassschuhe || existing.kodexeMassschuhe,
      kodexeEinlagen: kodexeEinlagen || existing.kodexeEinlagen,
      sonstiges: sonstiges || existing.sonstiges,
      updatedBy: req.user.id,
    };
    const updatedCustomer = await prisma.customers.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        kundeSteuernummer: true,
        diagnose: true,
        kodexeMassschuhe: true,
        kodexeEinlagen: true,
        sonstiges: true,
        updatedBy: true,
      },
    });
    res.status(200).json({
      success: true,
      message: "Customer special fields updated successfully",
      data: updatedCustomer,
    });
  } catch (err: any) {
    console.error("Update Customer Special Fields Error:", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};

export const getCustomerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { date: screenerDate } = req.query; // Get date query parameter

    // 1. Fetch customer first
    const customer = await prisma.customers.findUnique({ where: { id } });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // 2. Build screener file query based on date filter
    let screenerFileQuery: any = {
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
    };

    // If date query parameter is provided, filter by exact date time
    if (screenerDate) {
      const targetDate = new Date(screenerDate as string);
      if (!isNaN(targetDate.getTime())) {
        // Filter by exact date time (not by day range)
        screenerFileQuery.where.createdAt = targetDate;
      }
    }

    // 3. Fetch related data in parallel
    const [
      versorgungen,
      einlagenAnswers,
      screenerFiles,
      customerHistories,
      partner,
      workshopNote,
      allScreenerDates, // Get all available dates for the dropdown
    ] = await Promise.all([
      prisma.customer_versorgungen.findMany({ where: { customerId: id } }),
      prisma.einlagenAnswers.findMany({
        where: { customerId: id },
        orderBy: [{ category: "asc" }, { questionId: "asc" }],
      }),
      prisma.screener_file.findMany(screenerFileQuery),
      prisma.customerHistorie.findMany({ where: { customerId: id } }),
      prisma.user.findUnique({ where: { id: customer.partnerId } }),
      prisma.workshopNote.findUnique({ where: { userId: userId } }),
      // Get all screener dates for dropdown options (full ISO strings)
      prisma.screener_file.findMany({
        where: { customerId: id },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // 4. Group einlagenAnswers by category
    const einlagenAnswersByCategory = new Map();
    einlagenAnswers.forEach((answer) => {
      if (!einlagenAnswersByCategory.has(answer.category)) {
        einlagenAnswersByCategory.set(answer.category, {
          category: answer.category,
          answers: [],
        });
      }
      einlagenAnswersByCategory.get(answer.category).answers.push({
        questionId: parseInt(answer.questionId),
        selected: answer.answer,
      });
    });

    // 5. Process screenerFiles images
    const processedScreenerFiles = screenerFiles.map((screener) => {
      const result = { ...screener };
      const imageFields = [
        "picture_10",
        "picture_23",
        "paint_24",
        "paint_23",
        "picture_11",
        "picture_24",
        "threed_model_left",
        "threed_model_right",
        "picture_17",
        "picture_16",
        "csvFile",
      ];

      // URLs are already S3 URLs, no formatting needed
      imageFields.forEach((field) => {
        if (result[field]) {
          result[field] = result[field]; // Already S3 URL
        }
      });

      return result;
    });

    // 6. Process customer histories images
    const processedHistories = customerHistories.map((history) => ({
      ...history,
      url: history.url || null,
    }));

    const processedPartner = partner
      ? {
          ...partner,
          image: partner.image || null,
        }
      : null;

    // 7. Extract full ISO date strings for dropdown (including time)
    const availableDates = allScreenerDates.map((screener) =>
      screener.createdAt.toISOString()
    );

    const customerWithImages = {
      ...customer,
      versorgungen,
      einlagenAnswers: Array.from(einlagenAnswersByCategory.values()),
      screenerFile: processedScreenerFiles,
      customerHistorie: processedHistories,
      // werkstattzettel,
      partner: processedPartner,
      workshopNote,
    };

    res.status(200).json({
      success: true,
      message: screenerDate
        ? `Customer fetched successfully with screener data for ${screenerDate}`
        : "Customer fetched successfully",
      data: [customerWithImages],
      availableDates: availableDates, // Full ISO strings with time
    });
  } catch (error: any) {
    console.error("Get Customer By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
//----------------------------------------end getCustomerById--------------------------------------------------

export const assignVersorgungToCustomer = async (
  req: Request,
  res: Response
) => {
  try {
    const { customerId, versorgungenId } = req.params;
    const [customer, versorgung] = await Promise.all([
      prisma.customers.findUnique({ where: { id: customerId } }),
      prisma.versorgungen.findUnique({ where: { id: versorgungenId } }),
    ]);
    if (!customer)
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    if (!versorgung)
      return res
        .status(404)
        .json({ success: false, message: "Versorgung not found" });
    // Get status from request body or use default
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({
        success: false,
        message:
          "status is required (Alltagseinlagen, Sporteinlagen, or Businesseinlagen)",
      });
    }

    // Find existing record first
    const diagnosisFilter =
      versorgung.diagnosis_status && versorgung.diagnosis_status.length > 0
        ? { hasSome: versorgung.diagnosis_status }
        : undefined;

    const existingRecord = await prisma.customer_versorgungen.findFirst({
      where: {
        customerId,
        status: status as any,
        diagnosis_status: diagnosisFilter,
      },
    });
    // Serialize material array to string for compatibility with current Prisma client
    const materialString = serializeMaterialField(versorgung.material);

    const createData: any = {
      name: versorgung.name,
      rohlingHersteller: versorgung.rohlingHersteller,
      artikelHersteller: versorgung.artikelHersteller,
      versorgung: versorgung.versorgung,
      material: materialString,
      status: status as any,
      diagnosis_status: versorgung.diagnosis_status,
      customerId,
    };

    // Add optional fields if provided
    if (req.body.cover_types !== undefined) {
      createData.cover_types = req.body.cover_types;
    }
    if (req.body.laser_print_prices !== undefined) {
      createData.laser_print_prices = req.body.laser_print_prices;
    }

    if (existingRecord) {
      const updateData: any = {
        name: versorgung.name,
        rohlingHersteller: versorgung.rohlingHersteller,
        artikelHersteller: versorgung.artikelHersteller,
        versorgung: versorgung.versorgung,
        material: materialString,
        status: status as any,
        diagnosis_status: versorgung.diagnosis_status,
      };

      // Add optional fields if provided
      if (req.body.cover_types !== undefined) {
        updateData.cover_types = req.body.cover_types;
      }
      if (req.body.laser_print_prices !== undefined) {
        updateData.laser_print_prices = req.body.laser_print_prices;
      }

      await prisma.customer_versorgungen.update({
        where: { id: existingRecord.id },
        data: updateData,
      });
    } else {
      await prisma.customer_versorgungen.create({
        data: createData,
      });
    }
    const updatedCustomer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        versorgungen: true,
        screenerFile: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    const latestScreener = updatedCustomer?.screenerFile[0] || null;
    const screenerData = latestScreener
      ? {
          id: latestScreener.id,
          customerId: latestScreener.customerId,
          picture_10: latestScreener.picture_10 || null,
          picture_23: latestScreener.picture_23 || null,
          paint_24: latestScreener.paint_24 || null,
          paint_23: latestScreener.paint_23 || null,
          picture_11: latestScreener.picture_11 || null,
          picture_24: latestScreener.picture_24 || null,
          threed_model_left: latestScreener.threed_model_left || null,
          threed_model_right: latestScreener.threed_model_right || null,
          picture_17: latestScreener.picture_17 || null,
          picture_16: latestScreener.picture_16 || null,
          csvFile: latestScreener.csvFile || null,
          createdAt: latestScreener.createdAt,
          updatedAt: latestScreener.updatedAt,
        }
      : null;

    const formattedCustomer = {
      ...updatedCustomer,
      screenerFile: screenerData ? [screenerData] : [],
    };

    res.status(200).json({
      success: true,
      message: "Versorgung assigned/replaced successfully",
      data: formattedCustomer,
    });
  } catch (error: any) {
    console.error("Assign Versorgung Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const undoAssignVersorgungToCustomer = async (
  req: Request,
  res: Response
) => {
  try {
    const { customerId, versorgungenId } = req.params;

    const existing = await prisma.customer_versorgungen.findFirst({
      where: {
        customerId,
        name:
          (
            await prisma.versorgungen.findUnique({
              where: { id: versorgungenId },
            })
          )?.name || "",
      },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Assigned Versorgung not found for this customer",
      });
    }

    await prisma.customer_versorgungen.delete({ where: { id: existing.id } });

    const updatedCustomer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        versorgungen: true,
        screenerFile: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const latestScreener = updatedCustomer?.screenerFile[0] || null;
    const screenerData = latestScreener
      ? {
          id: latestScreener.id,
          customerId: latestScreener.customerId,
          picture_10: latestScreener.picture_10 || null,
          picture_23: latestScreener.picture_23 || null,
          paint_24: latestScreener.paint_24 || null,
          paint_23: latestScreener.paint_23 || null,
          picture_11: latestScreener.picture_11 || null,
          picture_24: latestScreener.picture_24 || null,
          threed_model_left: latestScreener.threed_model_left || null,
          threed_model_right: latestScreener.threed_model_right || null,
          picture_17: latestScreener.picture_17 || null,
          picture_16: latestScreener.picture_16 || null,
          csvFile: latestScreener.csvFile || null,
          createdAt: latestScreener.createdAt,
          updatedAt: latestScreener.updatedAt,
        }
      : null;

    const formattedCustomer = {
      ...updatedCustomer,
      screenerFile: screenerData ? [screenerData] : [],
    };

    res.status(200).json({
      success: true,
      message: "Versorgung assignment undone successfully",
      data: formattedCustomer,
    });
  } catch (error: any) {
    console.error("Undo Assign Versorgung Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// export const searchCustomers = async (req: Request, res: Response) => {
//   try {
//     const { search, email, phone, location, id, name, limit = 10 } = req.query;

//     // Build dynamic where conditions
//     const whereConditions: any[] = [];

//     // General search across name fields (first name and last name)
//     if (name && typeof name === 'string' && name.trim()) {
//       const nameQuery = name.trim();
//       whereConditions.push({
//         OR: [
//           {
//             vorname: {
//               contains: nameQuery,
//               mode: "insensitive",
//             },
//           },
//           {
//             nachname: {
//               contains: nameQuery,
//               mode: "insensitive",
//             },
//           },
//         ],
//       });
//     }

//     // General search across name fields
//     if (search && typeof search === 'string' && search.trim()) {
//       const searchQuery = search.trim();
//       whereConditions.push({
//         OR: [
//           {
//             vorname: {
//               contains: searchQuery,
//               mode: "insensitive",
//             },
//           },
//           {
//             nachname: {
//               contains: searchQuery,
//               mode: "insensitive",
//             },
//           },
//         ],
//       });
//     }

//     // Specific email search
//     if (email && typeof email === 'string' && email.trim()) {
//       whereConditions.push({
//         email: {
//           contains: email.trim(),
//           mode: "insensitive",
//         },
//       });
//     }

//     // Specific phone search
//     if (phone && typeof phone === 'string' && phone.trim()) {
//       whereConditions.push({
//         telefonnummer: {
//           contains: phone.trim(),
//           mode: "insensitive",
//         },
//       });
//     }

//     // Specific location search
//     if (location && typeof location === 'string' && location.trim()) {
//       whereConditions.push({
//         wohnort: {
//           contains: location.trim(),
//           mode: "insensitive",
//         },
//       });
//     }

//     // Specific customer ID search
//     if (id && typeof id === 'string' && id.trim()) {
//       whereConditions.push({
//         id: {
//           equals: id.trim(),
//         },
//       });
//     }

//     // If no search criteria provided, return empty results
//     if (whereConditions.length === 0) {
//       return res.status(200).json({
//         success: true,
//         message: "No search criteria provided",
//         data: {
//           totalResults: 0,
//           suggestions: [],
//         },
//       });
//     }

//     const limitNumber = Math.min(parseInt(limit as string) || 10, 50);

//     const customers = await prisma.customers.findMany({
//       where: {
//         AND: whereConditions,
//       },
//       select: {
//         id: true,
//         vorname: true,
//         nachname: true,
//         email: true,
//         telefonnummer: true,
//         wohnort: true,
//         createdAt: true,
//       },
//       take: limitNumber,
//       orderBy: [
//         { vorname: "asc" },
//         { nachname: "asc" },
//       ],
//     });

//     const suggestions = customers.map((customer) => ({
//       id: customer.id,
//       name: `${customer.vorname} ${customer.nachname}`,
//       email: customer.email,
//       phone: customer.telefonnummer,
//       location: customer.wohnort,
//       fullName: `${customer.vorname} ${customer.nachname}`,
//       createdAt: customer.createdAt,
//     }));

//     res.status(200).json({
//       success: true,
//       message: "Customer search results",
//       data: suggestions,
//     });
//   } catch (error: any) {
//     console.error("Search Customers Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Something went wrong",
//       error: error.message,
//     });
//   }
// };

export const searchCustomers = async (req: Request, res: Response) => {
  try {
    const {
      search,
      email,
      phone,
      location,
      id,
      name,
      geburtsdatum,
      customerNumber,
      limit = 10,
      page = 1,
    } = req.query;

    const userId = req.user.id;
    const userRole = req.user.role;

    const limitNumber = Math.min(
      Math.max(parseInt(limit as string) || 10, 1),
      100
    );
    const pageNumber = Math.max(parseInt(page as string) || 1, 1);
    const skip = (pageNumber - 1) * limitNumber;

    // Build search conditions array
    const searchConditions: any[] = [];

    // Always filter by user (except ADMIN can see all)
    if (userRole !== "ADMIN") {
      searchConditions.push({ partnerId: userId });
    }

    // Handle general search across multiple fields
    if (search && typeof search === "string") {
      const searchQuery = search.trim();
      if (searchQuery) {
        searchConditions.push({
          OR: [
            { vorname: { contains: searchQuery, mode: "insensitive" } },
            { nachname: { contains: searchQuery, mode: "insensitive" } },
            { email: { contains: searchQuery, mode: "insensitive" } },
            { telefon: { contains: searchQuery, mode: "insensitive" } },
            { wohnort: { contains: searchQuery, mode: "insensitive" } },
          ],
        });
      }
    } else {
      // Specific field searches (only if no general search)
      if (name && typeof name === "string") {
        const nameQuery = name.trim();
        if (nameQuery) {
          const nameParts = nameQuery.split(/\s+/).filter(Boolean);
          if (nameParts.length > 1) {
            searchConditions.push({
              AND: [
                { vorname: { contains: nameParts[0], mode: "insensitive" } },
                {
                  nachname: {
                    contains: nameParts.slice(1).join(" "),
                    mode: "insensitive",
                  },
                },
              ],
            });
          } else {
            searchConditions.push({
              OR: [
                { vorname: { contains: nameQuery, mode: "insensitive" } },
                { nachname: { contains: nameQuery, mode: "insensitive" } },
              ],
            });
          }
        }
      }

      if (email && typeof email === "string" && email.trim()) {
        searchConditions.push({
          email: { contains: email.trim(), mode: "insensitive" },
        });
      }

      if (phone && typeof phone === "string" && phone.trim()) {
        searchConditions.push({
          telefon: { contains: phone.trim(), mode: "insensitive" },
        });
      }

      if (location && typeof location === "string" && location.trim()) {
        searchConditions.push({
          wohnort: { contains: location.trim(), mode: "insensitive" },
        });
      }
    }

    // Exact matches (always applied)
    if (id && typeof id === "string" && id.trim()) {
      searchConditions.push({ id: id.trim() });
    }

    if (
      geburtsdatum &&
      typeof geburtsdatum === "string" &&
      geburtsdatum.trim()
    ) {
      searchConditions.push({ geburtsdatum: geburtsdatum.trim() });
    }

    if (customerNumber) {
      const num = Number(customerNumber);
      if (Number.isFinite(num)) {
        searchConditions.push({ customerNumber: num });
      }
    }

    // Build final where condition
    const whereConditions =
      searchConditions.length > 0
        ? { AND: searchConditions }
        : userRole !== "ADMIN"
        ? { partnerId: userId }
        : {};

    // Execute queries in parallel
    const [total, customers] = await prisma.$transaction([
      prisma.customers.count({ where: whereConditions }),
      prisma.customers.findMany({
        where: whereConditions,
        select: {
          id: true,
          vorname: true,
          nachname: true,
          email: true,
          telefon: true,
          wohnort: true,
          customerNumber: true,
          geburtsdatum: true,
          createdAt: true,
        },
        take: limitNumber,
        skip,
        orderBy: [{ vorname: "asc" }, { nachname: "asc" }],
      }),
    ]);

    res.status(200).json({
      success: true,
      message: "Customer search results",
      data: {
        totalResults: total,
        totalPages: Math.ceil(total / limitNumber),
        currentPage: pageNumber,
        customers: customers.map((customer) => ({
          id: customer.id,
          name: `${customer.vorname || ""} ${customer.nachname || ""}`.trim(),
          email: customer.email,
          phone: customer.telefon,
          location: customer.wohnort,
          customerNumber: customer.customerNumber,
          geburtsdatum: customer.geburtsdatum,
          createdAt: customer.createdAt,
        })),
      },
    });
  } catch (error: any) {
    console.error("Search Customers Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// model screener_file {
//   id         String    @id @default(uuid())
//   customerId String
//   customer   customers @relation(fields: [customerId], references: [id], onDelete: Cascade)

//   picture_10        String? //Fersenneigung left (image)
//   picture_23        String? //Plantaransicht left (image)
//   threed_model_left String? //3D-Model left   (.stl)
//   picture_17        String? //Sohlen Index left (image)

//   picture_11         String? //Fersenneigung right (image)
//   picture_24         String? //Plantaransich right  (image)
//   threed_model_right String? //3D-Model right   .stl
//   picture_16         String? //Sohlen Index right   (image)
//   csvFile            String?

//   // this all data come form a single csv file
//   fusslange1   String? //B58   (.csv)
//   fusslange2   String? //C58   (.csv)
//   fussbreite1  String? //B73   (.csv)
//   fussbreite2  String? //C73   (.csv)
//   kugelumfang1 String? //B102  (.csv)
//   kugelumfang2 String? //C102  (.csv)
//   rist1        String? //B105  (.csv)
//   rist2        String? //C105  (.csv)
//   zehentyp1    String? //B136  (.csv)
//   zehentyp2    String? //C136  (.csv)
//   archIndex1   String? //B120  (.csv)
//   archIndex2   String? //C120  (.csv)

//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt

//   @@index([customerId])
//   @@index([id])
//   @@index([createdAt])
// }

// model screener_file {
//   id         String    @id @default(uuid())
//   customerId String
//   customer   customers @relation(fields: [customerId], references: [id], onDelete: Cascade)

//   picture_10        String? //Fersenneigung left (image)
//   picture_23        String? //Plantaransicht left (image)
//   threed_model_left String? //3D-Model left   (.stl)
//   picture_17        String? //Sohlen Index left (image)

//   picture_11         String? //Fersenneigung right (image)
//   picture_24         String? //Plantaransich right  (image)
//   threed_model_right String? //3D-Model right   .stl
//   picture_16         String? //Sohlen Index right   (image)
//   csvFile            String?

//   // this all data come form a single csv file
// fusslange1   String? //B58   (.csv)
// fusslange2   String? //C58   (.csv)
// fussbreite1  String? //B73   (.csv)
// fussbreite2  String? //C73   (.csv)
// kugelumfang1 String? //B102  (.csv)
// kugelumfang2 String? //C102  (.csv)
// rist1        String? //B105  (.csv)
// rist2        String? //C105  (.csv)
// zehentyp1    String? //B136  (.csv)
// zehentyp2    String? //C136  (.csv)
// archIndex1   String? //B120  (.csv)
// archIndex2   String? //C120  (.csv)

//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt

//   @@index([customerId])
//   @@index([id])
//   @@index([createdAt])
// }

export const addScreenerFile = async (req: Request, res: Response) => {
  const { customerId } = req.params;
  const files = req.files as any;

  const cleanupFiles = () => {
    if (!files) return;
    Object.keys(files).forEach((key) => {
      files[key].forEach((file: any) => {
        if (file.location) {
          // Delete from S3 if file was uploaded
          deleteFileFromS3(file.location);
        }
      });
    });
  };

  try {
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    let csvS3Url: string | null = null;
    let csvData: any = {};
    if (files.csvFile && files.csvFile[0]) {
      csvS3Url = files.csvFile[0].location;
      if (csvS3Url) {
        csvData = await parseCSV(csvS3Url);
      }
    }

    if (Object.keys(csvData).length > 0) {
      await prisma.customers.update({
        where: { id: customerId },
        data: {
          fusslange1: csvData.B58 || null,
          fusslange2: csvData.C58 || null,
          fussbreite1: csvData.B73 || null,
          fussbreite2: csvData.C73 || null,
          kugelumfang1: csvData.B102 || null,
          kugelumfang2: csvData.C102 || null,
          rist1: csvData.B105 || null,
          rist2: csvData.C105 || null,
          archIndex1: csvData.B120 || null,
          archIndex2: csvData.C120 || null,
          zehentyp1: csvData.B136 || null,
          zehentyp2: csvData.C136 || null,
          updatedBy: req.user.id,
          updatedAt: new Date(),
        },
      });
    }

    const newScreener = await prisma.screener_file.create({
      data: {
        customerId,
        picture_10: files.picture_10?.[0]?.location || null,
        picture_23: files.picture_23?.[0]?.location || null,
        paint_24: files.paint_24?.[0]?.location || null,
        paint_23: files.paint_23?.[0]?.location || null,
        threed_model_left: files.threed_model_left?.[0]?.location || null,
        picture_17: files.picture_17?.[0]?.location || null,
        picture_11: files.picture_11?.[0]?.location || null,
        picture_24: files.picture_24?.[0]?.location || null,
        threed_model_right: files.threed_model_right?.[0]?.location || null,
        picture_16: files.picture_16?.[0]?.location || null,
        csvFile: csvS3Url,
        // ---
        fusslange1: csvData.B58 || null,
        fusslange2: csvData.C58 || null,
        fussbreite1: csvData.B73 || null,
        fussbreite2: csvData.C73 || null,
        kugelumfang1: csvData.B102 || null,
        kugelumfang2: csvData.C102 || null,
        rist1: csvData.B105 || null,
        rist2: csvData.C105 || null,
        archIndex1: csvData.B120 || null,
        archIndex2: csvData.C120 || null,
        zehentyp1: csvData.B136 || null,
        zehentyp2: csvData.C136 || null,
      },
    });

    const formattedScreener = {
      id: newScreener.id,
      customerId: newScreener.customerId,
      picture_10: newScreener.picture_10 || null,
      picture_23: newScreener.picture_23 || null,
      paint_24: newScreener.paint_24 || null,
      paint_23: newScreener.paint_23 || null,
      picture_11: newScreener.picture_11 || null,
      picture_24: newScreener.picture_24 || null,
      threed_model_left: newScreener.threed_model_left || null,
      threed_model_right: newScreener.threed_model_right || null,
      picture_17: newScreener.picture_17 || null,
      picture_16: newScreener.picture_16 || null,
      csvFile: newScreener.csvFile || null,
      // CSV export data for this scanner set
      csvData: {
        fusslange1: newScreener.fusslange1,
        fusslange2: newScreener.fusslange2,
        fussbreite1: newScreener.fussbreite1,
        fussbreite2: newScreener.fussbreite2,
        kugelumfang1: newScreener.kugelumfang1,
        kugelumfang2: newScreener.kugelumfang2,
        rist1: newScreener.rist1,
        rist2: newScreener.rist2,
        zehentyp1: newScreener.zehentyp1,
        zehentyp2: newScreener.zehentyp2,
        archIndex1: newScreener.archIndex1,
        archIndex2: newScreener.archIndex2,
      },
      createdAt: newScreener.createdAt,
      updatedAt: newScreener.updatedAt,
    };

    await prisma.customerHistorie.create({
      data: {
        customerId: customerId,
        category: "Leistungen",
        url: `/customers/screener-file/${newScreener.id}`,
        methord: "GET",
        eventId: customerId,
        system_note: "Fußscan",
      },
    });

    // if (csvFileName && files.csvFile?.[0]?.path) {
    //   try {
    //     fs.unlinkSync(files.csvFile[0].path);
    //   } catch (err) {
    //     console.error(
    //       `Failed to delete CSV file ${files.csvFile[0].path}`,
    //       err
    //     );
    //   }
    // }

    res.status(201).json({
      success: true,
      message: "New screener file set added successfully",
      data: formattedScreener,
    });
  } catch (error: any) {
    console.error("Add Screener File Error:", error);
    cleanupFiles();
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updateScreenerFile = async (req: Request, res: Response) => {
  const { customerId, screenerId } = req.params;
  const files = req.files as any;

  const cleanupFiles = () => {
    if (!files) return;
    Object.keys(files).forEach((key) => {
      files[key].forEach((file: any) => {
        if (file.location) {
          // Delete from S3 if file was uploaded
          deleteFileFromS3(file.location);
        }
      });
    });
  };

  try {
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        fusslange1: true,
        fusslange2: true,
        fussbreite1: true,
        fussbreite2: true,
        kugelumfang1: true,
        kugelumfang2: true,
        rist1: true,
        rist2: true,
        archIndex1: true,
        archIndex2: true,
        zehentyp1: true,
        zehentyp2: true,
      },
    });

    if (!customer) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const existingScreener = await prisma.screener_file.findUnique({
      where: {
        id: screenerId,
      },
    });

    if (!existingScreener || existingScreener.customerId !== customerId) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Screener file not found for this customer",
      });
    }

    const latestScreener = await prisma.screener_file.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { id: true },
    });
    console.log("latestScreener:", latestScreener);

    const deleteOldIfNew = (newFile: any, oldFileUrl: string | null) => {
      if (newFile && oldFileUrl && oldFileUrl.startsWith("http")) {
        deleteFileFromS3(oldFileUrl);
      }
    };

    const updateData: any = {};
    let csvData: any = {};
    let csvS3Url: string | null = existingScreener.csvFile;

    if (files?.picture_10?.[0]) {
      deleteOldIfNew(files.picture_10[0], existingScreener.picture_10);
      updateData.picture_10 = files.picture_10[0].location;
    }

    if (files?.picture_23?.[0]) {
      deleteOldIfNew(files.picture_23[0], existingScreener.picture_23);
      updateData.picture_23 = files.picture_23[0].location;
    }
    // ---------------------------------------------------------------
    if (files?.paint_24?.[0]) {
      deleteOldIfNew(files.paint_24[0], existingScreener.paint_24);
      updateData.paint_24 = files.paint_24[0].location;
    }
    if (files?.paint_23?.[0]) {
      deleteOldIfNew(files.paint_23[0], existingScreener.paint_23);
      updateData.paint_23 = files.paint_23[0].location;
    }
    //------------------------------------------------------------------


    if (files?.threed_model_left?.[0]) {
      deleteOldIfNew(
        files.threed_model_left[0],
        existingScreener.threed_model_left
      );
      updateData.threed_model_left = files.threed_model_left[0].location;
    }

    if (files?.picture_17?.[0]) {
      deleteOldIfNew(files.picture_17[0], existingScreener.picture_17);
      updateData.picture_17 = files.picture_17[0].location;
    }

    if (files?.picture_11?.[0]) {
      deleteOldIfNew(files.picture_11[0], existingScreener.picture_11);
      updateData.picture_11 = files.picture_11[0].location;
    }

    if (files?.picture_24?.[0]) {
      deleteOldIfNew(files.picture_24[0], existingScreener.picture_24);
      updateData.picture_24 = files.picture_24[0].location;
    }

    if (files?.threed_model_right?.[0]) {
      deleteOldIfNew(
        files.threed_model_right[0],
        existingScreener.threed_model_right
      );
      updateData.threed_model_right = files.threed_model_right[0].location;
    }

    if (files?.picture_16?.[0]) {
      deleteOldIfNew(files.picture_16[0], existingScreener.picture_16);
      updateData.picture_16 = files.picture_16[0].location;
    }

    if (files?.csvFile?.[0]) {
      deleteOldIfNew(files.csvFile[0], existingScreener.csvFile);
      csvS3Url = files.csvFile[0].location;
      if (csvS3Url) {
        csvData = await parseCSV(csvS3Url);
      }
      updateData.csvFile = csvS3Url;

      // Store CSV data in the screener_file record (each scanner set has its own CSV data)
      updateData.fusslange1 =
        csvData.B58 ?? existingScreener.fusslange1 ?? null;
      updateData.fusslange2 =
        csvData.C58 ?? existingScreener.fusslange2 ?? null;
      updateData.fussbreite1 =
        csvData.B73 ?? existingScreener.fussbreite1 ?? null;
      updateData.fussbreite2 =
        csvData.C73 ?? existingScreener.fussbreite2 ?? null;
      updateData.kugelumfang1 =
        csvData.B102 ?? existingScreener.kugelumfang1 ?? null;
      updateData.kugelumfang2 =
        csvData.C102 ?? existingScreener.kugelumfang2 ?? null;
      updateData.rist1 = csvData.B105 ?? existingScreener.rist1 ?? null;
      updateData.rist2 = csvData.C105 ?? existingScreener.rist2 ?? null;
      updateData.archIndex1 =
        csvData.B120 ?? existingScreener.archIndex1 ?? null;
      updateData.archIndex2 =
        csvData.C120 ?? existingScreener.archIndex2 ?? null;
      updateData.zehentyp1 = csvData.B136 ?? existingScreener.zehentyp1 ?? null;
      updateData.zehentyp2 = csvData.C136 ?? existingScreener.zehentyp2 ?? null;
    }

    // Only update customer record if this is the latest screener file
    if (Object.keys(csvData).length > 0 && latestScreener?.id === screenerId) {
      await prisma.customers.update({
        where: { id: customerId },
        data: {
          fusslange1: csvData.B58 ?? customer.fusslange1,
          fusslange2: csvData.C58 ?? customer.fusslange2,
          fussbreite1: csvData.B73 ?? customer.fussbreite1,
          fussbreite2: csvData.C73 ?? customer.fussbreite2,
          kugelumfang1: csvData.B102 ?? customer.kugelumfang1,
          kugelumfang2: csvData.C102 ?? customer.kugelumfang2,
          rist1: csvData.B105 ?? customer.rist1,
          rist2: csvData.C105 ?? customer.rist2,
          archIndex1: csvData.B120 ?? customer.archIndex1,
          archIndex2: csvData.C120 ?? customer.archIndex2,
          zehentyp1: csvData.B136 ?? customer.zehentyp1,
          zehentyp2: csvData.C136 ?? customer.zehentyp2,
          updatedBy: req.user.id,
          updatedAt: new Date(),
        },
      });
    }

    // Update the screener file record only if there are changes
    const updatedScreener = await prisma.screener_file.update({
      where: { id: screenerId },
      data: updateData,
    });

    // Format the response - URLs are already S3 URLs
    const formattedScreener = {
      id: updatedScreener.id,
      customerId: updatedScreener.customerId,
      picture_10: updatedScreener.picture_10 || null,
      picture_23: updatedScreener.picture_23 || null,
      paint_24: updatedScreener.paint_24 || null,
      paint_23: updatedScreener.paint_23 || null,
      picture_11: updatedScreener.picture_11 || null,
      picture_24: updatedScreener.picture_24 || null,
      threed_model_left: updatedScreener.threed_model_left || null,
      threed_model_right: updatedScreener.threed_model_right || null,
      picture_17: updatedScreener.picture_17 || null,
      picture_16: updatedScreener.picture_16 || null,
      csvFile: updatedScreener.csvFile || null,
      // CSV export data for this scanner set
      csvData: {
        fusslange1: updatedScreener.fusslange1,
        fusslange2: updatedScreener.fusslange2,
        fussbreite1: updatedScreener.fussbreite1,
        fussbreite2: updatedScreener.fussbreite2,
        kugelumfang1: updatedScreener.kugelumfang1,
        kugelumfang2: updatedScreener.kugelumfang2,
        rist1: updatedScreener.rist1,
        rist2: updatedScreener.rist2,
        zehentyp1: updatedScreener.zehentyp1,
        zehentyp2: updatedScreener.zehentyp2,
        archIndex1: updatedScreener.archIndex1,
        archIndex2: updatedScreener.archIndex2,
      },
      createdAt: updatedScreener.createdAt,
      updatedAt: updatedScreener.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: "Screener file updated successfully",
      data: formattedScreener,
    });
  } catch (error: any) {
    console.error("Update Screener File Error:", error);
    cleanupFiles();
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteScreenerFile = async (req: Request, res: Response) => {
  const { screenerId } = req.params;

  try {
    const screenerFile = await prisma.screener_file.findUnique({
      where: { id: screenerId },
    });

    if (!screenerFile) {
      return res.status(404).json({
        success: false,
        message: "Screener file not found",
      });
    }

    const fileFields = [
      screenerFile.picture_10,
      screenerFile.picture_23,
      screenerFile.picture_17,
      screenerFile.picture_11,
      screenerFile.picture_24,
      screenerFile.picture_16,
      screenerFile.threed_model_left,
      screenerFile.threed_model_right,
      screenerFile.csvFile,
    ];

    // Delete files from S3 (fire-and-forget, no await)
    fileFields.forEach((file) => {
      if (file && file.startsWith("http")) {
        deleteFileFromS3(file);
      }
    });

    await prisma.screener_file.delete({
      where: { id: screenerId },
    });

    res.status(200).json({
      success: true,
      message: "Screener file deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete Screener File Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getScreenerFileById = async (req: Request, res: Response) => {
  try {
    const { screenerId } = req.params;

    const screenerFile = await prisma.screener_file.findUnique({
      where: { id: screenerId },
    });

    if (!screenerFile) {
      return res.status(404).json({
        success: false,
        message: "Screener file not found",
      });
    }

    // URLs are already S3 URLs
    const formattedScreener = {
      id: screenerFile.id,
      customerId: screenerFile.customerId,
      picture_10: screenerFile.picture_10 || null,
      picture_23: screenerFile.picture_23 || null,
      paint_24: screenerFile.paint_24 || null,
      paint_23: screenerFile.paint_23 || null,
      picture_11: screenerFile.picture_11 || null,
      picture_24: screenerFile.picture_24 || null,
      threed_model_left: screenerFile.threed_model_left || null,
      threed_model_right: screenerFile.threed_model_right || null,
      picture_17: screenerFile.picture_17 || null,
      picture_16: screenerFile.picture_16 || null,
      csvFile: screenerFile.csvFile || null,
      // CSV export data for this scanner set
      csvData: {
        fusslange1: screenerFile.fusslange1,
        fusslange2: screenerFile.fusslange2,
        fussbreite1: screenerFile.fussbreite1,
        fussbreite2: screenerFile.fussbreite2,
        kugelumfang1: screenerFile.kugelumfang1,
        kugelumfang2: screenerFile.kugelumfang2,
        rist1: screenerFile.rist1,
        rist2: screenerFile.rist2,
        zehentyp1: screenerFile.zehentyp1,
        zehentyp2: screenerFile.zehentyp2,
        archIndex1: screenerFile.archIndex1,
        archIndex2: screenerFile.archIndex2,
      },
      createdAt: screenerFile.createdAt,
      updatedAt: screenerFile.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: "Screener file fetched successfully",
      data: formattedScreener,
    });
  } catch (error: any) {
    console.error("Get Screener File Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getEinlagenInProduktion = async (req: Request, res: Response) => {
  try {
    const where: any = {
      orderStatus: {
        in: [
          "Einlage_vorbereiten",
          "Einlage_in_Fertigung",
          "Einlage_verpacken",
          "Einlage_Abholbereit",
        ],
      },
    };

    // Additional filters (optional)
    if (req.query.customerId) {
      where.customerId = req.query.customerId as string;
    }

    if (req.query.partnerId) {
      where.partnerId = req.query.partnerId as string;
    }

    // Optional: Filter by specific status if provided
    if (req.query.specificStatus) {
      const specificStatus = req.query.specificStatus as string;
      if (
        [
          "Einlage_vorbereiten",
          "Einlage_in_Fertigung",
          "Einlage_verpacken",
          "Einlage_Abholbereit",
        ].includes(specificStatus)
      ) {
        where.orderStatus = specificStatus;
      }
    }

    // Get all active orders without pagination
    const orders = await prisma.customerOrders.findMany({
      where,
      orderBy: {
        statusUpdate: "desc", // Sort by status update time (most recent first)
        createdAt: "desc", // Then by creation time
      },
      select: {
        id: true,
        fußanalyse: true,
        einlagenversorgung: true,
        totalPrice: true,
        orderStatus: true,
        statusUpdate: true,
        invoice: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            id: true,
            vorname: true,
            nachname: true,
            email: true,
            // telefonnummer: true,
            telefon: true,
            wohnort: true,
            customerNumber: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            rohlingHersteller: true,
            artikelHersteller: true,
            versorgung: true,
            material: true,
            status: true,
            diagnosis_status: true,
          },
        },
      },
    });

    // Format orders - URLs are already S3 URLs
    const formattedOrders = orders.map((order) => ({
      ...order,
      invoice: order.invoice || null,
      partner: order.partner
        ? {
            ...order.partner,
            image: order.partner.image || null,
          }
        : null,
    }));

    // Get status counts for statistics
    //-----------------------------------------------------------------------------------------------------------------------------
    // const statusCounts: any = await prisma.customerOrders.groupBy({
    //   by: ["orderStatus"] as any,
    //   where: {
    //     orderStatus: {
    //       in: [
    //         "Einlage_vorbereiten",
    //         "Einlage_in_Fertigung",
    //         "Einlage_verpacken",
    //         "Einlage_Abholbereit",
    //       ],
    //     },
    //   },
    //   _count: {
    //     id: true,
    //   },
    // });

    // Using raw query to avoid TypeScript circular reference issue with Prisma groupBy
    // Note: Table name matches Prisma model name (customerOrders)
    const statusCounts = await prisma.$queryRaw<
      Array<{ orderStatus: string; count: bigint }>
    >`
      SELECT "orderStatus", COUNT(id) as count
      FROM "customerOrders"
      WHERE "orderStatus" IN ('Einlage_vorbereiten', 'Einlage_in_Fertigung', 'Einlage_verpacken', 'Einlage_Abholbereit')
      GROUP BY "orderStatus"
    `;

    // Transform to match expected format
    const formattedStatusCounts = statusCounts.map((item) => ({
      orderStatus: item.orderStatus,
      _count: { id: Number(item.count) },
    }));

    res.status(200).json({
      success: true,
      message: "Active orders fetched successfully",
      data: formattedOrders,
      statistics: {
        totalActiveOrders: orders.length,
        statusBreakdown: formattedStatusCounts.reduce((acc, item) => {
          acc[item.orderStatus] = item._count.id;
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (error: any) {
    console.error("Get Active Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching active orders",
      error: error.message,
    });
  }
};

export const filterCustomer = async (req: Request, res: Response) => {
  try {
    const {
      today,
      yesterday,
      thisWeek,
      lastWeek,
      thisMonth,
      month,
      year,
      //---------------------
      completedOrders,
      noOrder,
      oneAllOrders,
      oneOrdersInProduction,
      finishedOrders,
      //--------------------
      paymnentType,
      geschaeftsstandort,
      page = "1",
      limit = "10",
      search,
    } = req.query;

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user context missing",
      });
    }

    const partnerId = req.user.id;

    const normalizeString = (value: unknown): string | undefined => {
      if (Array.isArray(value)) {
        value = value[0];
      }
      return typeof value === "string" ? value : undefined;
    };

    const parseBoolean = (value: unknown): boolean => {
      const normalized = normalizeString(value);
      if (!normalized) return false;
      return ["true", "1", "yes"].includes(normalized.toLowerCase());
    };

    const parseIntOrNull = (value: unknown): number | null => {
      const normalized = normalizeString(value);
      if (!normalized) {
        return null;
      }
      const parsed = Number.parseInt(normalized, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const clampNumber = (value: unknown, fallback: number): number => {
      const parsed = parseIntOrNull(value);
      return parsed === null ? fallback : parsed;
    };

    const completedOrdersFilter = parseBoolean(completedOrders);
    const noOrderFilter = parseBoolean(noOrder);
    const oneAllOrdersFilter = parseBoolean(oneAllOrders);
    const oneOrdersInProductionFilter = parseBoolean(oneOrdersInProduction);
    const finishedOrdersFilter = parseBoolean(finishedOrders);
    const normalizedPaymnentType = normalizeString(paymnentType)?.toLowerCase();
    const normalizedGeschaeftsstandort = normalizeString(geschaeftsstandort)?.trim();

    // Validate mutually exclusive filters
    const activeOrderFilters = [
      { name: "completedOrders", active: completedOrdersFilter },
      { name: "noOrder", active: noOrderFilter },
      { name: "oneAllOrders", active: oneAllOrdersFilter },
      { name: "oneOrdersInProduction", active: oneOrdersInProductionFilter },
      { name: "finishedOrders", active: finishedOrdersFilter },
    ].filter((f) => f.active);

    if (activeOrderFilters.length > 1) {
      return res.status(400).json({
        success: false,
        message: `Only one order filter can be used at a time. Active filters: ${activeOrderFilters.map((f) => f.name).join(", ")}`,
      });
    }

    // Validate payment type
    if (
      normalizedPaymnentType &&
      normalizedPaymnentType !== "insurance" &&
      normalizedPaymnentType !== "private"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid paymnentType. Allowed values: 'insurance' or 'private'",
      });
    }

    const limitNumber = Math.min(Math.max(clampNumber(limit, 10), 1), 100);
    const pageNumber = Math.max(clampNumber(page, 1), 1);
    const skip = (pageNumber - 1) * limitNumber;

    const monthNumber = parseIntOrNull(month);
    const yearNumber = parseIntOrNull(year);

    if (monthNumber !== null && (monthNumber < 1 || monthNumber > 12)) {
      return res.status(400).json({
        success: false,
        message: "Month must be an integer between 1 and 12.",
      });
    }

    const timeframeFlags = [
      { key: "today", active: parseBoolean(today) },
      { key: "yesterday", active: parseBoolean(yesterday) },
      { key: "thisWeek", active: parseBoolean(thisWeek) },
      { key: "lastWeek", active: parseBoolean(lastWeek) },
      { key: "thisMonth", active: parseBoolean(thisMonth) },
    ];

    const activeTimeframes = timeframeFlags.filter((flag) => flag.active);

    if (
      (monthNumber !== null || yearNumber !== null) &&
      activeTimeframes.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Month/year filters cannot be combined with relative time filters (today, thisWeek, etc.).",
      });
    }

    if (activeTimeframes.length > 1) {
      return res.status(400).json({
        success: false,
        message: "Choose only one relative time filter at a time.",
      });
    }

    const startOfDay = (date: Date) => {
      const copy = new Date(date);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };

    const addDays = (date: Date, days: number) => {
      const copy = new Date(date);
      copy.setDate(copy.getDate() + days);
      return copy;
    };

    const startOfWeek = (date: Date) => {
      const copy = startOfDay(date);
      const day = copy.getDay(); // 0 (Sun) - 6 (Sat)
      const diff = day === 0 ? -6 : 1 - day; // Monday as first day
      copy.setDate(copy.getDate() + diff);
      return copy;
    };

    const now = new Date();
    let dateRange: { start: Date; end: Date } | null = null;

    if (yearNumber !== null) {
      const rangeMonth = monthNumber ?? null;
      const start = new Date(yearNumber, rangeMonth ? rangeMonth - 1 : 0, 1);
      const end = rangeMonth
        ? new Date(yearNumber, rangeMonth, 1)
        : new Date(yearNumber + 1, 0, 1);
      dateRange = { start, end };
    } else if (monthNumber !== null) {
      const currentYear = now.getFullYear();
      const start = new Date(currentYear, monthNumber - 1, 1);
      const end = new Date(currentYear, monthNumber, 1);
      dateRange = { start, end };
    } else if (activeTimeframes.length === 1) {
      const timeframe = activeTimeframes[0].key;
      switch (timeframe) {
        case "today": {
          const start = startOfDay(now);
          const end = addDays(start, 1);
          dateRange = { start, end };
          break;
        }
        case "yesterday": {
          const end = startOfDay(now);
          const start = addDays(end, -1);
          dateRange = { start, end };
          break;
        }
        case "thisWeek": {
          const start = startOfWeek(now);
          const end = addDays(start, 7);
          dateRange = { start, end };
          break;
        }
        case "lastWeek": {
          const end = startOfWeek(now);
          const start = addDays(end, -7);
          dateRange = { start, end };
          break;
        }
        case "thisMonth": {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          dateRange = { start, end };
          break;
        }
        default:
          break;
      }
    }

    const whereConditions: any = [];

    if (dateRange) {
      whereConditions.push({
        createdAt: {
          gte: dateRange.start,
          lt: dateRange.end,
        },
      });
    }

    if (completedOrdersFilter) {
      // Customers with orders that have "Ausgeführt" status
      whereConditions.push({
        customerOrders: {
          some: {
            orderStatus: "Ausgeführt",
          },
        },
      });
    }

    if (noOrderFilter) {
      // Customers with no customerOrders records
      whereConditions.push({
        customerOrders: {
          none: {},
        },
      });
    }

    if (finishedOrdersFilter) {
      // Customers who have at least one order with "Ausgeführt" status
      whereConditions.push({
        customerOrders: {
          some: {
            orderStatus: "Ausgeführt",
          },
        },
      });
    }

    // Add initial filtering for count-based filters (exact count will be checked in post-processing)
    if (oneAllOrdersFilter) {
      // Customers with at least one order (exact count of 1 will be checked in post-processing)
      whereConditions.push({
        customerOrders: {
          some: {},
        },
      });
    }

    if (oneOrdersInProductionFilter) {
      // Customers with at least one order that is NOT "Ausgeführt" (exact count will be checked in post-processing)
      whereConditions.push({
        customerOrders: {
          some: {
            orderStatus: {
              not: "Ausgeführt",
            },
          },
        },
      });
    }

    // Note: Payment type filtering will be done after fetching based on latestOrder
    // This is because we need to filter by the most recent order's payment status,
    // not just any order with that payment status

    const normalizedSearch = normalizeString(search)?.trim();
    if (normalizedSearch) {
      whereConditions.push({
        OR: [
          { vorname: { contains: normalizedSearch, mode: "insensitive" } },
          { nachname: { contains: normalizedSearch, mode: "insensitive" } },
          { email: { contains: normalizedSearch, mode: "insensitive" } },
          { telefon: { contains: normalizedSearch, mode: "insensitive" } },
          // { telefonnummer: { contains: normalizedSearch, mode: "insensitive" } },
          { wohnort: { contains: normalizedSearch, mode: "insensitive" } },
        ],
      });
    }

    const where: any = whereConditions.length ? { AND: whereConditions } : {};

    // If payment type, geschaeftsstandort, or count-based filters are applied, fetch more records to account for filtering
    // We'll filter after fetching, so we need a larger batch to ensure we get enough results
    const needsPostFilter = normalizedPaymnentType || normalizedGeschaeftsstandort || oneAllOrdersFilter || oneOrdersInProductionFilter;
    const fetchLimit = needsPostFilter
      ? limitNumber * 5 // Fetch 5x more to account for filtering
      : limitNumber;

    const [totalCount, customers] = await prisma.$transaction([
      prisma.customers.count({ where: { ...where, partnerId: partnerId } }),
      prisma.customers.findMany({
        where: { ...where, partnerId: partnerId },
        skip: needsPostFilter ? 0 : skip, // Start from beginning if filtering
        take: needsPostFilter ? fetchLimit : limitNumber,
        orderBy: { createdAt: "desc" },
        include: {
          customerOrders: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              orderStatus: true,
              totalPrice: true,
              createdAt: true,
              bezahlt: true,
              geschaeftsstandort: true,
            },
          },
          massschuheOrders: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              createdAt: true,
            },
          },
          screenerFile: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              customerId: true,
              // picture_10: true,
              // picture_23: true,
              // picture_11: true,
              // picture_24: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const completedStatusesForCount = new Set(COMPLETED_ORDER_STATUSES);

    const formatScreener = (screener: any | undefined) =>
      screener
        ? {
            id: screener.id,
            createdAt: screener.createdAt,
            // picture_10: screener.picture_10
            //   ? getImageUrl(`/uploads/${screener.picture_10}`)
            //   : null,
            // picture_23: screener.picture_23
            //   ? getImageUrl(`/uploads/${screener.picture_23}`)
            //   : null,
            // picture_11: screener.picture_11
            //   ? getImageUrl(`/uploads/${screener.picture_11}`)
            //   : null,
            // picture_24: screener.picture_24
            //   ? getImageUrl(`/uploads/${screener.picture_24}`)
            //   : null,
          }
        : null;

    // Map customers to response data
    let responseData = customers.map((customer) => {
      const completedOrdersCount = customer.customerOrders.filter((order) =>
        completedStatusesForCount.has(order.orderStatus)
      ).length;

      const latestOrder = customer.customerOrders[0] || null;
      const latestScreener = formatScreener(customer.screenerFile[0]);
      const latestMassschuheOrder = customer.massschuheOrders?.[0] || null;
      const billingType = latestOrder?.bezahlt || null;

      return {
        id: customer.id,
        customerNumber: customer.customerNumber,
        vorname: customer.vorname,
        nachname: customer.nachname,
        email: customer.email,
        // telefonnummer: customer.telefonnummer,
        wohnort: customer.wohnort,
        createdAt: customer.createdAt,
        totalOrders: customer.customerOrders.length,
        completedOrders: completedOrdersCount,
        latestOrder,
        latestScreener,
        latestMassschuheOrder,
        billingType,
        // Keep customerOrders for filtering logic (will be removed before response if needed)
        _customerOrders: customer.customerOrders,
      };
    });

    // Filter by payment type based on latest order's payment status
    if (normalizedPaymnentType) {
      if (normalizedPaymnentType === "insurance") {
        // Insurance: Only include customers whose latest order has insurance payment
        responseData = responseData.filter((customer) => {
          const latestOrderBezahlt = customer.latestOrder?.bezahlt;
          return (
            latestOrderBezahlt === "Krankenkasse_Ungenehmigt" ||
            latestOrderBezahlt === "Krankenkasse_Genehmigt"
          );
        });
      } else if (normalizedPaymnentType === "private") {
        // Private: Only include customers whose latest order has private payment
        responseData = responseData.filter((customer) => {
          const latestOrderBezahlt = customer.latestOrder?.bezahlt;
          return (
            latestOrderBezahlt === "Privat_Bezahlt" ||
            latestOrderBezahlt === "Privat_offen"
          );
        });
      }
    }

    // Filter by geschaeftsstandort based on latest order's geschaeftsstandort (supports JSON)
    if (normalizedGeschaeftsstandort) {
      responseData = responseData.filter((customer) => {
        const latestOrderGeschaeftsstandort = customer.latestOrder?.geschaeftsstandort;
        if (latestOrderGeschaeftsstandort == null) return false;
        const searchable =
          typeof latestOrderGeschaeftsstandort === "object"
            ? JSON.stringify(latestOrderGeschaeftsstandort)
            : String(latestOrderGeschaeftsstandort);
        return searchable.toLowerCase().includes(normalizedGeschaeftsstandort.toLowerCase());
      });
    }

    // Post-process filters that require exact counts
    if (oneAllOrdersFilter) {
      // Customers with exactly one customerOrders record (any status)
      responseData = responseData.filter((customer) => {
        return customer.totalOrders === 1;
      });
    }

    if (oneOrdersInProductionFilter) {
      // Customers with exactly one order that is NOT "Ausgeführt"
      responseData = responseData.filter((customer: any) => {
        const nonFinishedOrders = customer._customerOrders.filter(
          (order: any) => order.orderStatus !== "Ausgeführt"
        );
        return nonFinishedOrders.length === 1 && customer.totalOrders === 1;
      });
    }

    // Apply pagination after filtering (if any post-fetch filters were applied)
    if (needsPostFilter || oneAllOrdersFilter || oneOrdersInProductionFilter) {
      const startIndex = skip;
      const endIndex = skip + limitNumber;
      responseData = responseData.slice(startIndex, endIndex);
    }

    // Remove internal _customerOrders field before sending response
    responseData = responseData.map((customer: any) => {
      const { _customerOrders, ...rest } = customer;
      return rest;
    });

    // Calculate total for pagination
    // Note: When payment type, geschaeftsstandort, or count-based filters are applied, totalItems is approximate
    // as we only count the filtered results from the fetched batch
    const filteredTotal = needsPostFilter || oneAllOrdersFilter || oneOrdersInProductionFilter
      ? Math.min(responseData.length + skip, totalCount) // Approximate
      : totalCount;

    res.status(200).json({
      success: true,
      message: "Customers filtered successfully",
      data: responseData,
      pagination: {
        totalItems: filteredTotal,
        totalPages: Math.ceil(filteredTotal / limitNumber),
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
      },
      appliedFilters: {
        today: parseBoolean(today),
        yesterday: parseBoolean(yesterday),
        thisWeek: parseBoolean(thisWeek),
        lastWeek: parseBoolean(lastWeek),
        thisMonth: parseBoolean(thisMonth),
        month: monthNumber,
        year: yearNumber,
        completedOrders: completedOrdersFilter,
        noOrder: noOrderFilter,
        oneAllOrders: oneAllOrdersFilter,
        oneOrdersInProduction: oneOrdersInProductionFilter,
        finishedOrders: finishedOrdersFilter,
        paymnentType: normalizedPaymnentType || undefined,
        geschaeftsstandort: normalizedGeschaeftsstandort || undefined,
        search: normalizedSearch || undefined,
        dateRange: dateRange
          ? {
              start: dateRange.start.toISOString(),
              end: dateRange.end.toISOString(),
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error("Filter Customer Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while filtering customers",
      error: error.message,
    });
  }
};

export const createCustomerRequirements = async (
  req: Request,
  res: Response
) => {
  try {
    const partnerId = req.user?.id;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      vorname,
      nachname,
      geburtsdatum,
      email,
      telefon,
      adresse,
      land,
      billingType,
    } = req.body;

    // Convert everything to boolean
    const requirementsData = {
      vorname: !!vorname,
      nachname: !!nachname,
      geburtsdatum: !!geburtsdatum,
      email: !!email,
      telefon: !!telefon,
      adresse: !!adresse,
      land: !!land,
      billingType: !!billingType,
    };

    const existingRequirements = await prisma.customer_requirements.findFirst({
      where: {
        partnerId,
      },
    });

    let customerRequirements;

    if (existingRequirements) {
      customerRequirements = await prisma.customer_requirements.update({
        where: {
          id: existingRequirements.id,
        },
        data: {
          ...requirementsData,
        },
      });
    } else {
      customerRequirements = await prisma.customer_requirements.create({
        data: {
          partnerId,
          ...requirementsData,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer requirements saved successfully",
      data: customerRequirements,
    });
  } catch (error: any) {
    console.error("Create/Update Customer Requirements Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while saving customer requirements",
      error: error.message,
    });
  }
};

export const getCustomerRequirements = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const customerRequirements = await prisma.customer_requirements.findFirst({
      where: {
        partnerId,
      },
      select: {
        vorname: true,
        nachname: true,
        geburtsdatum: true,
        email: true,
        telefon: true,
        adresse: true,
        land: true,
        billingType: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Customer requirements fetched successfully",
      data: customerRequirements,
    });
  } catch (error: any) {
    console.error("Get Customer Requirements Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while saving customer requirements",
      error: error.message,
    });
  }
};


export const getAllVersorgungenByCustomerId = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const userId = req.user.id;

    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Check if customer exists and belongs to user
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true, partnerId: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (customer.partnerId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this customer's data",
      });
    }

    // Get all orders with versorgungId, ordered by creation date (latest first)
    const orders = await prisma.customerOrders.findMany({
      where: {
        customerId,
        partnerId: userId,
        versorgungId: { not: null },
      },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        geschaeftsstandort: true,
        versorgungId: true,
        Versorgungen: {
          select: {
            supplyStatus: {
              select: {
                id: true,
                name: true,
                price: true,
                image: true,
                description: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by versorgungId and keep only the latest order for each Versorgungen
    const versorgungenMap = new Map();
    
    orders.forEach((order) => {
      const versorgungId = order.versorgungId;
      const supplyStatus = order.Versorgungen?.supplyStatus;
      
      if (versorgungId && supplyStatus && supplyStatus.id) {
        // If this versorgungId hasn't been seen yet, or this order is newer, keep it
        if (!versorgungenMap.has(versorgungId)) {
          versorgungenMap.set(versorgungId, {
            supplyStatus: {
              ...supplyStatus,
              image: supplyStatus.image || null,
            },
            order: {
              id: order.id,
              orderNumber: order.orderNumber,
              createdAt: order.createdAt,
              filiale: order.geschaeftsstandort ?? null,
            },
          });
        }
      }
    });

    // Convert to array and apply pagination
    const allVersorgungen = Array.from(versorgungenMap.values());
    const totalItems = allVersorgungen.length;
    const paginatedVersorgungen = allVersorgungen.slice(skip, skip + limit);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.status(200).json({
      success: true,
      message: "Versorgungen with order info fetched successfully",
      data: paginatedVersorgungen,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error: any) {
    console.error("Get All Versorgungen By Customer Id Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching versorgungen",
      error: error.message,
    });
  }
};