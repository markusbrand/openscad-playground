"""Export endpoints for OpenSCAD source code."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.schemas.export import ExportScadRequest, ExportScadResponse

router = APIRouter(prefix="/export", tags=["export"])


@router.post("/scad", response_model=ExportScadResponse)
async def export_scad(body: ExportScadRequest, request: Request) -> ExportScadResponse:
    """Format / optimise OpenSCAD source for download.

    When *optimize_for_freecad* is ``True`` the output includes a
    compatibility header and is forced to ASCII.
    """
    export_service = request.app.state.export_service

    code, filename = export_service.format_scad(
        body.code,
        optimize_for_freecad=body.optimize_for_freecad,
    )
    return ExportScadResponse(code=code, filename=filename)
