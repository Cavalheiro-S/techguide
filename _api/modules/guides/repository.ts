import fs from "fs/promises";
import path from "path";
import sift from "sift";
import readYamlFile from "read-yaml-file/index";
import { slugify } from "@src/infra/slugify";
import { paginate } from "@src/infra/paginate";
import { Guide, GuideInput, GuidesInput, SiteLocale } from "@api/gql_types";
import { gqlInput } from "@api/infra/graphql/gqlInput";
import { storage } from "@api/infra/storage";

const ALLOW_LIST = [];

const pathToGuideByLocale = {
  [SiteLocale.PtBr]: path.resolve(".", "_data", "guides", "pt_BR"),
  [SiteLocale.EnUs]: path.resolve(".", "_data", "guides", "en_US"),
  [SiteLocale.Es]: path.resolve(".", "_data", "guides", "es"),
};

export function guidesRepository() {
  const repository = {
    async getAll({ input }: { input: GuidesInput }): Promise<Guide[]> {
      const { filter = {}, offset, limit, locale } = input;
      const pathToGuides = pathToGuideByLocale[locale];

      const guideFileNames = (await fs.readdir(pathToGuides)).filter(
        (fileName) => !ALLOW_LIST.includes(fileName)
      );

      const guides = await Promise.all<Guide>(
        guideFileNames.map(async (fileName) => {
          const slug = slugify(fileName.replace(".yaml", ""));

          const guideCache = await storage.get(`guide-${locale}-${slug}`);
          if (guideCache) return guideCache;

          const fileContent = await readYamlFile<any>(
            path.resolve(pathToGuides, fileName)
          );

          return {
            ...fileContent,
            id: slug,
            slug: slug,
            name: fileContent.name,
            expertises: fileContent.expertise.map((expertise) => {
              let blocks = [];

              if (expertise.blocks) {
                blocks = expertise.blocks.map((block) => {
                  const [slug] = Object.keys(block);
                  return {
                    item: {
                      ...block,
                      id: slug,
                      slug: slug,
                    },
                    priority: block.priority,
                  };
                });
              }

              return {
                ...expertise,
                blocks,
              };
            }),
            collaborations: fileContent.collaboration.map((collaboration) => {
              let blocks = [];

              if (collaboration.blocks) {
                blocks = collaboration.blocks.map((block) => {
                  const [slug] = Object.keys(block);

                  return {
                    item: {
                      ...block,
                      id: slug,
                      slug: slug,
                    },
                    priority: block.priority,
                  };
                });
              }

              return {
                ...collaboration,
                blocks,
              };
            }),
          };
        })
      );

      guides.forEach((guide) =>
        storage.set(`guide-${locale}-${guide.slug}`, guide)
      );

      const output = paginate<Guide>(
        guides.filter(sift(filter)),
        limit,
        offset
      );

      return output;
    },
    async getBySlug({ input }: { input: GuideInput }): Promise<Guide> {
      const guides = await repository.getAll({
        input: gqlInput<GuidesInput>({
          ...input,
          filter: {
            slug: {
              eq: input.slug,
            },
          },
        }),
      });

      return guides[0];
    },
  };

  return repository;
}
