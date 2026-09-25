import { Router, type IRouter } from 'express';
import { GetDiagnosticCatalogQueryParams,GetDiagnosticCatalogResponse,
  SetDiagnosticItemTargetsBody,CreateDiagnosticResourceBody,GetDiagnosticReportResponse,
  SaveDiagnosticReviewBody } from '@workspace/api-zod';
import { requireRole } from '../../middlewares/auth';
import { badRequest } from '../../shared/http-error';
import * as service from './service';

const router: IRouter = Router();
const staff = requireRole('TEACHER','ADMIN');
const admin = requireRole('ADMIN');
function id(raw: unknown) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw badRequest('Дугаар буруу байна.','INVALID_ID');
  return value;
}
router.get('/teacher/diagnostic-catalog',staff,async(req,res,next)=>{
  try {
    const query=GetDiagnosticCatalogQueryParams.safeParse(req.query);
    if(!query.success) throw badRequest('Анги, хичээл сонгоно уу.','INVALID_QUERY');
    res.json(GetDiagnosticCatalogResponse.parse(await service.catalog(req.user!,query.data.classId,query.data.subjectId)));
  } catch(error){next(error);}
});
router.put('/admin/diagnostic-items/:itemId/targets',admin,async(req,res,next)=>{
  try {
    const input=SetDiagnosticItemTargetsBody.safeParse(req.body);
    if(!input.success) throw badRequest('Холбоос буруу байна.','INVALID_INPUT');
    res.json(await service.setTargets(id(req.params.itemId),input.data.mapIds));
  } catch(error){next(error);}
});
router.post('/admin/diagnostic-resources',admin,async(req,res,next)=>{
  try {
    const input=CreateDiagnosticResourceBody.safeParse(req.body);
    if(!input.success) throw badRequest('Материалын мэдээлэл буруу байна.','INVALID_INPUT');
    res.status(201).json(await service.createResource(req.user!,input.data));
  } catch(error){next(error);}
});
router.get('/teacher/diagnostic-attempts/:attemptId',staff,async(req,res,next)=>{
  try {res.json(GetDiagnosticReportResponse.parse(await service.report(req.user!,id(req.params.attemptId))));}
  catch(error){next(error);}
});
router.put('/teacher/diagnostic-attempts/:attemptId',staff,async(req,res,next)=>{
  try {
    const input=SaveDiagnosticReviewBody.safeParse(req.body);
    if(!input.success) throw badRequest('Төлөвлөгөөний мэдээлэл буруу байна.','INVALID_INPUT');
    res.json(GetDiagnosticReportResponse.parse(await service.save(req.user!,id(req.params.attemptId),input.data)));
  } catch(error){next(error);}
});
export default router;
