import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { data } from "../../../assets/v1/data";
import { data as characteristicIcons } from "../../../assets/v1/data";
import { Multer } from "multer";
import { deleteFileFromS3, deleteMultipleFilesFromS3 } from "../../../utils/s3utils";
import { getImageUrl } from "../../../utils/base_utl";
const prisma = new PrismaClient();

// -------------------------------------------
const normalizeGender = (gender: string) => {
  const g = gender.toUpperCase();
  return ["MALE", "FEMALE", "UNISEX"].includes(g) ? g : null;
};

const buildSearchQuery = (search: string) => {
  const isNumber = !isNaN(Number(search));
  return {
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { brand: { contains: search, mode: "insensitive" } },
      { Company: { contains: search, mode: "insensitive" } },
      {
        colors: {
          some: {
            OR: [
              { colorName: { contains: search, mode: "insensitive" } },
              { colorCode: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
      ...(isNumber ? [{ price: { equals: Number(search) } }] : []),
    ],
  };
};

const normalizes = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .replace(/\s+/g, "_")
    .trim();
};

const buildFilterQuery = (query: any) => {
  const {
    name,
    brand,
    category,
    subCategory,
    typeOfShoes,
    offer,
    // size,
    colorName,
    colorCode,
    company,
    gender,
    availability,
    minPrice,
    maxPrice,
  } = query;

  const where: any = {};

  // Basic search filters
  if (name) where.name = { contains: name, mode: "insensitive" };
  if (brand) where.brand = { contains: brand, mode: "insensitive" };
  if (category) where.Category = { contains: category, mode: "insensitive" };
  if (subCategory && subCategory !== "null")
    where.Sub_Category = { contains: subCategory, mode: "insensitive" };

  // Shoes type filter
  if (typeOfShoes) {
    const types = Array.isArray(typeOfShoes) ? typeOfShoes : [typeOfShoes];
    where.typeOfShoes = { in: types, mode: "insensitive" };
  }

  // Offer filter (as string)
  if (offer) {
    where.offer = { contains: offer, mode: "insensitive" };
  }

  // Size filter inside JSON string
  // if (size) {
  //   try {
  //     const sizeFilters = typeof size === "string" ? JSON.parse(size) : size;
  //     if (Array.isArray(sizeFilters)) {
  //       where.size = {
  //         array_contains: sizeFilters.map((s) => ({ size: s.size })),
  //       };
  //     }
  //   } catch (err) {
  //     console.error("Invalid size JSON format in query:", err);
  //   }
  // }

  // Color name / code filter
  if (colorName || colorCode) {
    const colorNames = Array.isArray(colorName)
      ? colorName
      : colorName
      ? [colorName]
      : [];
    const colorCodes = Array.isArray(colorCode)
      ? colorCode
      : colorCode
      ? [colorCode]
      : [];

    where.colors = {
      some: {
        OR: [
          ...(colorNames.length > 0
            ? [{ colorName: { in: colorNames, mode: "insensitive" } }]
            : []),
          ...(colorCodes.length > 0
            ? [{ colorCode: { in: colorCodes, mode: "insensitive" } }]
            : []),
        ],
      },
    };
  }

  // Company
  if (company) {
    where.Company = { contains: company, mode: "insensitive" };
  }

  // Gender
  if (gender) {
    const g = gender.toUpperCase();
    if (["MALE", "FEMALE", "UNISEX"].includes(g)) {
      where.gender = g;
    }
  }

  // Availability
  if (availability !== undefined) {
    where.availability = availability === "true";
  }

  // Price range
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = Number(minPrice);
    if (maxPrice) where.price.lte = Number(maxPrice);
  }

  return where;
};

const paginate = (limit: string, page: string) => {
  const itemsPerPage = Math.min(parseInt(limit), 50);
  const currentPage = Math.max(parseInt(page), 1);
  const skip = (currentPage - 1) * itemsPerPage;
  return { itemsPerPage, currentPage, skip };
};

const sortQuery = (sortBy: string, sortOrder: string) => {
  const allowed = ["createdAt", "price", "name", "brand"];
  const orderBy: any = {};
  if (allowed.includes(sortBy)) {
    orderBy[sortBy] = sortOrder === "asc" ? "asc" : "desc";
  } else {
    orderBy.createdAt = "desc";
  }
  return orderBy;
};

// const formatProductsWithImageUrls = (products: any[]) =>
//   products.map((product) => ({
//     ...product,
//     colors: product.colors.map((color) => ({
//       ...color,
//       images: color.images.map((image) => ({
//         ...image,
//         url: getImageUrl(`/uploads/${image.url}`),
//       })),
//     })),
//   }));

const formatProductsWithImageUrls = (products: any[]) =>
  products.map((product) => ({
    ...product,
    characteristics: mapCharacteristicsToDetails(product.characteristics || []),
    colors: product.colors.map((color) => ({
      ...color,
      images: color.images.map((image) => ({
        ...image,
        url: image.url || null,
      })),
    })),
  }));

const mapCharacteristicsToDetails = (ids: number[]) => {
  return characteristicIcons
    .filter((item) => ids.includes(item.id))
    .map((item) => ({
      id: item.id,
      text: item.text,
      image: getImageUrl(`/assets/v1/kein_titel/${item.image}`),
    }));
};

// ----------------------------------------------------------

export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      name,
      brand,
      Category,
      Sub_Category,
      typeOfShoes,
      productDesc,
      price,
      availability,
      offer,
      size,
      feetFirstFit,
      footLength,
      technicalData,
      Company,
      gender,
      colors,
      question,
      characteristics,
    } = req.body;

    console.log(question);

    const files = req.files;

    if (!name || !brand) {
      res.status(400).json({
        success: false,
        message: "Name and brand are required fields",
      });
      return;
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({
        success: false,
        message: "No image files uploaded",
      });
      return;
    }

    let parsedColors: any[] = [];
    try {
      parsedColors = colors ? JSON.parse(colors) : [];
    } catch {
      res.status(400).json({
        success: false,
        message: "Invalid colors JSON format",
      });
      return;
    }

    let parsedCharacteristics: number[] = [];
    try {
      if (typeof characteristics === "string") {
        // Remove any extra quotes that might make it a string instead of an array
        const cleanedString = characteristics.replace(/^"|"$/g, "");
        parsedCharacteristics = JSON.parse(cleanedString);
      } else {
        parsedCharacteristics = characteristics || [];
      }

      if (!Array.isArray(parsedCharacteristics)) {
        throw new Error("Characteristics must be an array");
      }

      parsedCharacteristics = parsedCharacteristics.map(Number);
    } catch (err) {
      console.log("Characteristics parsing error:", err);
      res.status(400).json({
        success: false,
        message: "Invalid characteristics format",
        error: err.message,
      });
      return;
    }

    const normalizedGender = normalizeGender(gender);

    const numericPrice = price ? parseFloat(price) : null;
    const numericOffer = offer ? parseFloat(offer) : null;

    let fileIndex = 0;
    const colorsWithFiles = parsedColors.map((color) => {
      const imageUrls: string[] = [];

      for (
        let i = 0;
        i < color.images.length && fileIndex < files.length;
        i++
      ) {
        imageUrls.push((files[fileIndex] as any).location);
        fileIndex++;
      }

      return {
        colorName: color.colorName,
        colorCode: color.colorCode,
        images: imageUrls,
      };
    });

    const createdProduct = await prisma.product.create({
      data: {
        name,
        brand,
        Category: Category || null,
        Sub_Category: Sub_Category || null,
        typeOfShoes: typeOfShoes || null,
        productDesc: productDesc || null,
        price: numericPrice,
        availability: availability === "true",
        offer: numericOffer,
        size: size || null,
        feetFirstFit: feetFirstFit || null,
        footLength: footLength || null,
        technicalData: technicalData || null,
        Company: Company || null,
        gender: normalizedGender as "MALE" | "FEMALE" | "UNISEX" | null,
        characteristics: parsedCharacteristics,
        question: question || null,
        colors: {
          create: colorsWithFiles.map((color) => ({
            colorName: color.colorName,
            colorCode: color.colorCode,
            images: {
              create: color.images.map((url) => ({
                url: url,
              })),
            },
          })),
        },
      },
      include: {
        colors: {
          include: {
            images: true,
          },
        },
      },
    });

    const productWithUrls = formatProductsWithImageUrls([createdProduct])[0];

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: productWithUrls,
    });
  } catch (error) {
    console.error("Create Product Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create product",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  console.log(req.body);
  try {
    const { id } = req.params;
    const {
      name,
      brand,
      Category,
      Sub_Category,
      typeOfShoes,
      productDesc,
      price,
      availability,
      offer,
      size,
      feetFirstFit,
      footLength,
      technicalData,
      Company,
      gender,
      question,
      colors,
      characteristics, // Add characteristics to destructuring
    } = req.body;

    console.log("question", question);
    const files = req.files;

    const existingProduct = await prisma.product.findUnique({
      where: {
        id: String(id),
      },
      include: {
        colors: {
          include: {
            images: true,
          },
        },
      },
    });

    if (!existingProduct) {
      res.status(404).json({
        message: "Product not found",
      });
      return;
    }

    let parsedColors;
    try {
      parsedColors = colors ? JSON.parse(colors) : [];
    } catch (e) {
      res.status(400).json({
        success: false,
        message: "Invalid colors format",
      });
      return;
    }

    // Map uploaded files to colors while preserving existing images
    let fileIndex = 0;
    const colorsWithFiles = parsedColors.map((color: any) => {
      const colorImages = [];

      // If this is an existing color, include its existing images
      if (color.id) {
        const existingColor = existingProduct.colors.find(
          (ec) => ec.id === color.id
        );
        if (existingColor) {
          colorImages.push(...existingColor.images.map((img) => img.url));
        }
      }

      // Add new images
      if (color.images) {
        for (const image of color.images) {
          if (
            image.isNew &&
            Array.isArray(files) && //change naw
            fileIndex < files.length
          ) {
            colorImages.push((files[fileIndex] as any).location);
            fileIndex++;
          } else if (!image.isNew && image.url) {
            colorImages.push(image.url);
          }
        }
      }

      return {
        id: color.id,
        colorName: color.colorName,
        colorCode: color.colorCode,
        images: colorImages,
      };
    });

    // Parse characteristics
    let parsedCharacteristics: number[] = [];
    try {
      if (typeof characteristics === "string") {
        const cleanedString = characteristics.replace(/^"|"$/g, "");
        parsedCharacteristics = JSON.parse(cleanedString);
      } else {
        parsedCharacteristics = characteristics || [];
      }

      if (!Array.isArray(parsedCharacteristics)) {
        throw new Error("Characteristics must be an array");
      }

      parsedCharacteristics = parsedCharacteristics.map(Number);
    } catch (err) {
      console.log("Characteristics parsing error:", err);
      res.status(400).json({
        success: false,
        message: "Invalid characteristics format",
        error: err.message,
      });
      return;
    }

    // Update product with color handling and characteristics
    const updatedProduct = await prisma.product.update({
      where: {
        id: String(id),
      },
      data: {
        name,
        brand,
        Category: Category || null,
        Sub_Category: Sub_Category || null,
        typeOfShoes: typeOfShoes || null,
        productDesc: productDesc || null,
        price: price ? parseFloat(price) : null,
        availability: availability === "true",
        offer: offer ? parseFloat(offer) : null,
        size: size || null,
        feetFirstFit: feetFirstFit || null,
        footLength: footLength || null,
        technicalData: technicalData || null,
        Company: Company || null,
        question: question || null,
        gender: gender
          ? (gender.toString().toUpperCase() as "MALE" | "FEMALE" | "UNISEX")
          : null,
        characteristics: parsedCharacteristics, // Add characteristics update
        colors: {
          deleteMany: {}, // Delete all existing colors
          create: colorsWithFiles.map((color: any) => ({
            colorName: color.colorName,
            colorCode: color.colorCode,
            images: {
              create: color.images.map((url: string) => ({
                url: url,
              })),
            },
          })),
        },
      },
      include: {
        colors: {
          include: {
            images: true,
          },
        },
      },
    });

    const productWithUrls = {
      ...updatedProduct,
      colors: updatedProduct.colors.map((color) => ({
        ...color,
        images: color.images.map((image) => ({
          ...image,
          url: image.url || null,
        })),
      })),
    };

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: productWithUrls,
    });
  } catch (error) {
    console.error("Update Product Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update product",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        colors: {
          include: {
            images: true,
          },
        },
      },
    });

    const productsWithImageUrls = formatProductsWithImageUrls(products);

    res.status(200).json({
      success: true,
      products: productsWithImageUrls,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteImage = async (req: Request, res: Response) => {
  const { id, imageName } = req.params;

  try {
    const image = await prisma.image.findFirst({
      where: {
        url: imageName,
        color: {
          productId: String(id),
        },
      },
      include: {
        color: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!image) {
      res.status(404).json({
        success: false,
        error: "Image not found in this product",
      });
      return;
    }

    // Delete image from S3 (fire-and-forget, no await)
    if (image.url && image.url.startsWith("http")) {
      deleteFileFromS3(image.url);
    }

    // Delete the image record from database
    await prisma.image.delete({
      where: {
        id: image.id,
      },
    });

    res.json({
      success: true,
      message: "Image deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const queryProducts = async (req: Request, res: Response) => {
  try {
    const {
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      limit = "10",
      page = "1",
      question,
      size,
    } = req.query;

    // Only parse size if it exists and is not empty
    let parsedSize = [];
    if (size && size !== '') {
      try {
        parsedSize = JSON.parse(size as string);
      } catch (err) {
        console.error("Error parsing size:", err);
        parsedSize = [];
      }
    }

    const where = search
      ? buildSearchQuery(search as string)
      : buildFilterQuery(req.query);

    const orderBy = sortQuery(sortBy as string, sortOrder as string);
    const { itemsPerPage, currentPage, skip } = paginate(
      limit as string,
      page as string
    );

    let filteredProducts;
    let totalFilteredCount;

    // Get all matching products first
    const allMatchingProducts = await prisma.product.findMany({
      where,
      orderBy,
      include: {
        colors: {
          include: {
            images: true,
          },
        },
      },
    });

    // Apply size filtering if needed
    let sizeFilteredProducts = allMatchingProducts;
    if (parsedSize.length > 0) {
      sizeFilteredProducts = allMatchingProducts.filter((product) => {
        if (!product.size) return false;
        try {
          const db_size = JSON.parse(product.size.toString());
          return parsedSize.some((sz) =>
            db_size.some((dbEl) => dbEl["size"] == sz["size"])
          );
        } catch (err) {
          console.error("Error parsing product size:", err);
          return false;
        }
      });
    }

    // Apply question filtering if needed
    if (question) {
      const question_json = JSON.parse(question as string);
      const inputAnswers = question_json["answers"];

      filteredProducts = sizeFilteredProducts.filter((product) => {
        try {
          const productQuestion = JSON.parse(product.question as string);
          const productAnswers = productQuestion["answers"];

          return inputAnswers.every((inputAnswer) =>
            productAnswers.some(
              (productAnswer) =>
                productAnswer["question"] === inputAnswer["question"] &&
                productAnswer["answer"] === inputAnswer["answer"]
            )
          );
        } catch (err) {
          console.error("Error parsing product question JSON:", err);
          return false;
        }
      });

      totalFilteredCount = filteredProducts.length;
      filteredProducts = filteredProducts.slice(skip, skip + itemsPerPage);
    } else {
      totalFilteredCount = sizeFilteredProducts.length;
      filteredProducts = sizeFilteredProducts.slice(skip, skip + itemsPerPage);
    }

    const productsWithUrls = formatProductsWithImageUrls(filteredProducts);
    const totalPages = Math.ceil(totalFilteredCount / itemsPerPage);

    res.status(200).json({
      success: true,
      products: productsWithUrls,
      pagination: {
        total: totalFilteredCount,
        currentPage,
        totalPages,
        itemsPerPage,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
    });
  } catch (error) {
    console.error("Query Products Error:", error);
    res.status(500).json({
      success: false,
      message: "Error while querying products",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// -----------------------------------------

// Helper normalize function (ignore case, spaces, symbols)
const normalize = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .replace(/\s+/g, "_")
    .trim();
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const product = await prisma.product.findUnique({
      where: { id: String(id) },
      include: {
        colors: {
          include: {
            images: true,
          },
        },
      },
    });

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }

    // Delete all images from S3 (fire-and-forget, no await)
    for (const color of product.colors) {
      for (const image of color.images) {
        if (image.url && image.url.startsWith("http")) {
          deleteFileFromS3(image.url);
        }
      }
    }

    await prisma.product.delete({
      where: {
        id: String(id),
      },
    });

    res.status(200).json({
      success: true,
      message: "Product and associated images deleted successfully",
    });
  } catch (error) {
    console.error("Delete Product Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// Basic filtering: /products/query?name=nike&brand=nike

// Price range: /products/query?minPrice=50&maxPrice=100

// Category filtering: /products/query?category=running&subCategory=trail

// Size and color: /products/query?size=10&color=black

// Pagination: /products/query?page=2&limit=10

// Sorting: /products/query?sortBy=price&sortOrder=desc

export const getSingleProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const product = await prisma.product.findUnique({
      where: { id: String(id) },
      include: {
        colors: {
          include: {
            images: true,
          },
        },
      },
    });

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }

    // Fetch recommended products based on similar attributes
    const recommendedProducts = await prisma.product.findMany({
      where: {
        AND: [
          { id: { not: product.id } }, // Exclude current product
          {
            OR: [
              { brand: product.brand },
              { Category: product.Category },
              // { typeOfShoes: product.typeOfShoes },
              // { Sub_Category: product.Sub_Category },
            ],
          },
        ],
      },
      take: 4, // Limit to 4 recommended products
      include: {
        colors: {
          include: {
            images: true,
          },
        },
      },
    });

    const productWithImageUrls = {
      ...product,
      characteristics: product.characteristics
        ? product.characteristics
            .map((id: number) => {
              const item = data.find((item) => item.id === id);
              return item
                ? {
                    ...item,
                    image: getImageUrl(`/assets/v1/kein_titel/${item.image}`),
                  }
                : null;
            })
            .filter(Boolean)
        : [],
      colors: product.colors.map((color) => ({
        ...color,
        images: color.images.map((image) => ({
          ...image,
          url: image.url || null,
        })),
      })),
    };

    // Format recommended products with image URLs
    const recommendedWithUrls =
      formatProductsWithImageUrls(recommendedProducts);

    res.status(200).json({
      success: true,
      product: productWithImageUrls,
      recommendedProducts: recommendedWithUrls,
    });
  } catch (error) {
    console.error("Get Single Product Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const characteristicsIcons = async (req: Request, res: Response) => {
  try {
    const iconsWithUrls = data.map((icon) => ({
      ...icon,
      image: getImageUrl(`/assets/v1/kein_titel/${icon.image}`),
    }));

    res.status(200).json({
      success: true,
      data: iconsWithUrls,
    });

  } catch (error) {
    console.error("Get Technical Icons Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch technical icons",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getCategorizedProducts = async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    // 1. First get unique categories and subcategories with counts
    const categoryCounts = await prisma.product.groupBy({
      by: ['Category'],
      where: {
        Category: { not: null }
      },
      _count: true
    });

    const subcategoryCounts = await prisma.product.groupBy({
      by: ['Sub_Category'],
      where: {
        Sub_Category: { 
          not: null,
          notIn: ['null', '']
        }
      },
      _count: true
    });

    // 2. Get products for each category with limit
    const categoryGroups = await Promise.all(
      categoryCounts.map(async ({ Category }) => {
        const products = await prisma.product.findMany({
          where: {
            Category,
            OR: [
              { Sub_Category: null },
              { Sub_Category: 'null' },
              { Sub_Category: '' }
            ]
          },
          select: {
            id: true,
            name: true,
            Category: true,
            Sub_Category: true,
            price: true,
            offer: true,
            availability: true,
            colors: {
              select: {
                id: true,
                colorName: true,
                colorCode: true,
                images: {
                  select: {
                    id: true,
                    url: true
                  }
                }
              }
            }
          },
          take: limit,
          orderBy: {
            createdAt: 'desc' // Get the most recent products
          }
        });

        return {
          name: Category,
          totalProducts: categoryCounts.find(c => c.Category === Category)._count,
          products: products.map(p => ({
            ...p,
            colors: p.colors.map(color => ({
              ...color,
            images: color.images.map(image => ({
              ...image,
              url: image.url || null
            }))
            }))
          }))
        };
      })
    );

    // 3. Get products for each subcategory with limit
    const subcategoryGroups = await Promise.all(
      subcategoryCounts
        .filter(({ Sub_Category }) => Sub_Category && Sub_Category !== 'null')
        .map(async ({ Sub_Category }) => {
          const products = await prisma.product.findMany({
            where: {
              Sub_Category
            },
            select: {
              id: true,
              name: true,
              Category: true,
              Sub_Category: true,
              price: true,
              offer: true,
              availability: true,
              colors: {
                select: {
                  id: true,
                  colorName: true,
                  colorCode: true,
                  images: {
                    select: {
                      id: true,
                      url: true
                    }
                  }
                }
              }
            },
            take: limit,
            orderBy: {
              createdAt: 'desc'
            }
          });

          return {
            name: Sub_Category,
            totalProducts: subcategoryCounts.find(s => s.Sub_Category === Sub_Category)._count,
            products: products.map(p => ({
              ...p,
              colors: p.colors.map(color => ({
                ...color,
            images: color.images.map(image => ({
              ...image,
              url: image.url || null
            }))
              }))
            }))
          };
        })
    );

    // 4. Combine results
    const result = [
      ...categoryGroups,
      ...subcategoryGroups
    ];

    res.status(200).json({
      success: true,
      data: result,
      meta: {
        limit,
        totalCategories: categoryGroups.length,
        totalSubcategories: subcategoryGroups.length
      }
    });
  } catch (error) {
    console.error('Error in getCategorizedProducts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categorized products'
    });
  }
};
