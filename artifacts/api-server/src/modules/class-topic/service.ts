import { HttpError, conflict, forbidden } from '../../shared/http-error';
import type { AuthenticatedUser } from '../identity/service';
import * as repository from './repository';

const isAdmin = (user: AuthenticatedUser) => user.roles.includes('ADMIN');

export const teacherClassTopics = (user: AuthenticatedUser) =>
  repository.classTopics(user.teacherId, isAdmin(user));

/**
 * The sections of one class's book, to choose from.
 *
 * Scoped by the board above rather than by a rule of its own: a teacher may
 * only open a picker for a class and subject they can already see, and
 * deriving that from the same query is what stops the two drifting apart.
 */
export async function teacherOutlineChoices(
  user: AuthenticatedUser,
  classId: string,
  subjectCode: string,
) {
  const visible = (await teacherClassTopics(user))
    .some((row) => row.classId === classId && row.subjectCode === subjectCode);
  if (!visible) throw forbidden('Энэ ангийн хичээлд хандах эрхгүй байна.', 'CLASS_NOT_YOURS');
  return repository.outlineChoices(classId, subjectCode);
}

export type ClassTopicInput = {
  classId: string; subjectCode: string; outlineNodeId?: string | null; note?: string | null;
};

/**
 * Moves one class's pointer.
 *
 * Four refusals, kept apart because they mean different things to the person
 * reading them: the pairing does not exist, this is not your subject, the
 * class has no book to point into, or the section belongs to another book.
 */
export async function setClassTopic(user: AuthenticatedUser, input: ClassTopicInput) {
  const { classId, subjectCode, outlineNodeId, note } = input;
  const [check] = await repository.topicWriteCheck(
    classId, subjectCode, outlineNodeId ?? null, user.teacherId, isAdmin(user),
  );
  if (!check) throw new HttpError(404, 'Энэ анги энэ хичээлийг үздэггүй байна.', 'CLASS_SUBJECT_NOT_FOUND');
  if (!check.canEdit) throw forbidden('Энэ хичээлийн сэдвийг өөрчлөх эрхгүй байна.', 'NOT_YOUR_SUBJECT');
  if (outlineNodeId && !check.hasBook) throw conflict('Энэ ангид үндсэн ном холбогдоогүй байна.', 'CLASS_BOOK_NOT_FOUND');
  if (!check.nodeBelongs) throw conflict('Сонгосон сэдэв энэ ангийн үндсэн номынх биш байна.', 'OUTLINE_NOT_IN_BOOK');

  await repository.writeClassTopic(classId, check.subjectId, outlineNodeId ?? null, note ?? null, user.id);
  return (await teacherClassTopics(user))
    .find((item) => item.classId === classId && item.subjectCode === subjectCode);
}
