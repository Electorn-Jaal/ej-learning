import type { DiagnosticResourceInput, DiagnosticReviewInput } from '@workspace/api-zod';
import type { AuthenticatedUser } from '../identity/service';
import { authorisedClass, editableSubjects } from '../class-access/service';
import { badRequest, conflict, notFound } from '../../shared/http-error';
import * as repository from './repository';

export async function catalog(user: AuthenticatedUser, classId: number, subjectId: number) {
  await authorisedClass(user,classId);
  await editableSubjects(user,classId,subjectId);
  const [targets,items,resources,sources] = await Promise.all([
    repository.targets(subjectId),repository.items(subjectId),repository.resources(subjectId),repository.sources(subjectId),
  ]);
  return {targets,items,resources,sources};
}

async function validateMaps(subjectId: number, mapIds: number[]) {
  const allowed = new Set((await repository.targets(subjectId)).map(t => t.mapId));
  if (new Set(mapIds).size !== mapIds.length || mapIds.some(id => !allowed.has(id))) {
    throw badRequest('Батлагдсан, ижил хичээлийн сэдэв–чадварын холбоос сонгоно уу.','INVALID_TARGETS');
  }
}

export async function setTargets(itemId: number,mapIds: number[]) {
  const [item] = await repository.itemSubject(itemId);
  if (!item) throw notFound('Асуулт олдсонгүй.','ITEM_NOT_FOUND');
  await validateMaps(item.subjectId,mapIds);
  await repository.setTargets(itemId,mapIds);
  return {id:itemId};
}

export async function createResource(user: AuthenticatedUser,input: DiagnosticResourceInput) {
  if (!input.title.trim() || !input.instructions.trim()) throw badRequest('Нэр, заавар шаардлагатай.','EMPTY_RESOURCE');
  const subjects = await repository.mapSubjects(input.mapIds);
  if (subjects.length !== 1) throw badRequest('Нэг хичээлийн холбоос сонгоно уу.','INVALID_TARGETS');
  const subjectId = subjects[0]!.subjectId;
  await validateMaps(subjectId,input.mapIds);
  if (input.sourceMaterialId && !(await repository.sources(subjectId)).some(s => s.id === input.sourceMaterialId)) {
    throw badRequest('Энэ хичээлийн батлагдсан ном сонгоно уу.','INVALID_SOURCE');
  }
  return repository.createResource(input,user.id);
}

export async function report(user: AuthenticatedUser,attemptId: number) {
  const [attempt] = await repository.attempt(attemptId);
  if (!attempt) throw notFound('Оношлогооны үр дүн олдсонгүй.','DIAGNOSTIC_NOT_FOUND');
  await authorisedClass(user,attempt.classId);
  await editableSubjects(user,attempt.classId,attempt.subjectId);
  const [saved] = await repository.review(attemptId);
  const evidence = saved?.evidence ?? await repository.evidence(attemptId);
  return {...attempt,evidence,resources:await repository.resources(attempt.subjectId),
    revision:saved?.revision ?? 0,entries:saved?.entries ?? [],note:saved?.note ?? '',updatedAt:saved?.updatedAt ?? null};
}

export async function save(user: AuthenticatedUser,attemptId: number,input: DiagnosticReviewInput) {
  const current = await report(user,attemptId);
  const allowed = new Set(current.evidence.flatMap(e => e.targets.map(t => t.mapId)));
  for (const entry of input.entries) {
    if (!allowed.has(entry.mapId) || !entry.title.trim() || !entry.instructions.trim()) {
      throw badRequest('Оношлогоонд байгаа сэдэв–чадвар болон ажлын нэр, зааврыг оруулна уу.','INVALID_PLAN_ENTRY');
    }
    if (entry.resourceId !== null && !current.resources.some(r => r.id===entry.resourceId && r.mapIds.includes(entry.mapId))) {
      throw badRequest('Материал энэ сэдэв–чадвартай холбогдоогүй байна.','RESOURCE_TARGET_MISMATCH');
    }
  }
  if (!await repository.saveReview(attemptId,input.revision,current.evidence,input.entries,input.note,user.id)) {
    throw conflict('Өөр багш эсвэл цонх энэ төлөвлөгөөг шинэчилсэн байна. Дахин нээж шалгана уу.','STALE_REVIEW');
  }
  return report(user,attemptId);
}
