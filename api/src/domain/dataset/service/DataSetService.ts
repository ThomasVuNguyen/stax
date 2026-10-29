/** Port of domain/dataset/service/DataSetService + DataSetServiceImpl. */
import * as DataSetEntity from "../../../entities/DataSet";
import type { DataSet } from "../../../entities/DataSet";
import { getMaxDataSets } from "../../../config/ApplicationLimits";
import { DataSetType } from "../../../enums/DataSetType";
import type { EvaluationType } from "../../../enums/EvaluationType";
import type { Ctx } from "../../../lib/ctx";
import { NotFoundException, ResourceLimitExceedException } from "../../../lib/errors";
import { DEFAULT_DATASET_NAME_FORMAT } from "../../../util/PlanckConstants";
import * as DataSetRepository from "../DataSetRepository";
import * as DataSetDTO from "../dto/DataSetDTO";
import type { DataSetListResponse } from "../dto/DataSetListResponse";

type UserRef = { id: string | null };

/** `includeHidden` is accepted but unused, as in Java. */
export async function getAllDataSets(ctx: Ctx, user: UserRef, _includeHidden: boolean | null): Promise<DataSetListResponse> {
  const datasets = await DataSetRepository.findAllByUser(ctx.db, user.id as string);
  const list = (type: DataSetType) => datasets.filter((d) => d.type === type).map(DataSetDTO.from);
  return {
    system_data_sets: list(DataSetType.SYSTEM),
    user_data_sets: list(DataSetType.USER),
    community_data_sets: list(DataSetType.COMMUNITY),
  };
}

export async function getDataSetById(ctx: Ctx, user: UserRef, id: string): Promise<DataSetDTO.DataSetDTO> {
  const dataSet = await DataSetRepository.findById(ctx.db, id, user.id as string);
  if (!dataSet) throw new NotFoundException("Dataset not found for id: " + id);
  return DataSetDTO.from(dataSet);
}

export async function createDataSet(
  ctx: Ctx,
  user: UserRef,
  name: string | null | undefined,
  description: string | null | undefined,
  type: EvaluationType | null,
): Promise<DataSet> {
  const dataSet = DataSetEntity.create({
    userId: user.id,
    name: name ?? null,
    description: description ?? null,
    type: DataSetType.USER,
    evaluationType: type,
  });
  const numDatasets = await DataSetRepository.countByUser(ctx.db, user.id as string);
  if (numDatasets + 1 > getMaxDataSets()) {
    throw new ResourceLimitExceedException(
      `Creation would result in exceeding the limit of ${getMaxDataSets()} data sets.`,
    );
  }
  if (name == null || name === "") {
    dataSet.name = DEFAULT_DATASET_NAME_FORMAT.replace("%d", String(numDatasets + 1));
  }
  return DataSetRepository.save(ctx.db, dataSet);
}

export async function updateDataset(
  ctx: Ctx,
  user: UserRef,
  id: string,
  name: string | null | undefined,
  description: string | null | undefined,
): Promise<DataSetDTO.DataSetDTO> {
  const dataSet = await getUserDataSetById(ctx, user, id);
  if (name != null && name !== "") dataSet.name = name;
  if (description != null) dataSet.description = description;
  return DataSetDTO.from(await DataSetRepository.save(ctx.db, dataSet));
}

async function getUserDataSetById(ctx: Ctx, user: UserRef, id: string): Promise<DataSet> {
  const dataSet = await DataSetRepository.findUserDataSetById(ctx.db, id, user.id as string);
  if (!dataSet) throw new NotFoundException("Dataset not found for id: " + id);
  return dataSet;
}
