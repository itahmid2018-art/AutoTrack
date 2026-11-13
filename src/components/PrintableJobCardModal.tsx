import React from 'react';
import { JobCard } from '../types';
import { Printer, X, Wrench, CheckSquare, Tag, Shield, Scissors, User, Phone } from 'lucide-react';
import {
  buildCustomerPortalUrl,
  buildQrMatrix,
  ensurePublicAccessToken,
} from '../utils/customerPortalUrl';

interface PrintableJobCardModalProps {
  job: JobCard;
  onClose: () => void;
}

export const PrintableJobCardModal: React.FC<PrintableJobCardModalProps> = ({ job, onClose }) => {
  const accessToken = ensurePublicAccessToken(job);
  const customerPortalUrl = buildCustomerPortalUrl({
    id: job.id,
    createdAt: job.createdAt,
    publicAccessToken: accessToken,
  });
  const qr = buildQrMatrix(customerPortalUrl);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur flex items-center justify-center p-4 overflow-y-auto">
      {/* Container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden no-print">
        
        {/* Modal Toolbar (Screen Only) */}
        <div className="p-4 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono uppercase">Technician Print Tag &amp; Service Slip</h2>
              <p className="text-xs text-zinc-400">Physical document to accompany tool during workshop service.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-5 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl shadow-lg transition-all flex items-center gap-2 active:scale-95 font-mono"
            >
              <Printer className="w-4 h-4" />
              <span>Print Now (Ctrl+P)</span>
            </button>

            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Preview Scroll Container (Screen View) */}
        <div className="p-6 overflow-y-auto bg-zinc-950/50 flex justify-center">
          
          {/* Actual Printable Page Area */}
          <div className="bg-white text-black p-8 max-w-3xl w-full font-sans shadow-2xl border border-zinc-300 text-xs leading-tight space-y-6 printable-document">
            
            {/* PART 1: WORKSHOP TOOL TRAVELER TAG (TOP HALF) */}
            <div className="border-2 border-black p-4 rounded-md space-y-4 relative">
              
              {/* Top Tag Header */}
              <div className="flex justify-between items-start border-b-2 border-black pb-3">
                <div>
                  <div className="text-xs font-extrabold tracking-widest font-mono uppercase text-zinc-800">
                    BOSCH &amp; VENDOR AUTHORISED SERVICE CENTER
                  </div>
                  <h1 className="text-xl font-black font-mono tracking-tight uppercase">WORKSHOP REPAIR TAG</h1>
                  <p className="text-[11px] text-zinc-700 font-mono">Attach this upper section to tool carrying case or workbench rack</p>
                </div>

                <div className="text-right border-l-2 border-black pl-4">
                  <div className="font-mono text-lg font-black">{job.id}</div>
                  <div className="text-[10px] font-mono text-zinc-700">Intake: {job.intakeDate}</div>
                  <div className="text-[10px] font-mono text-zinc-700">Promised: {job.promisedCompletion}</div>
                </div>
              </div>

              {/* Tool Specs Grid */}
              <div className="grid grid-cols-3 gap-3 bg-zinc-100 p-3 border border-black rounded text-[11px]">
                <div>
                  <span className="font-bold block uppercase text-[10px] text-zinc-600">TOOL BRAND &amp; CATEGORY</span>
                  <span className="font-extrabold text-sm">{job.tool.brand}</span>
                  <div className="text-zinc-700">{job.tool.category}</div>
                </div>

                <div>
                  <span className="font-bold block uppercase text-[10px] text-zinc-600">MODEL NUMBER</span>
                  <span className="font-mono font-extrabold text-sm text-black">{job.tool.modelNumber}</span>
                  <div className="font-mono text-zinc-700">Voltage: {job.tool.voltageRating}</div>
                </div>

                <div>
                  <span className="font-bold block uppercase text-[10px] text-zinc-600">SERIAL NUMBER / BARE TOOL</span>
                  <span className="font-mono font-bold">{job.tool.serialNumber}</span>
                  <div className="text-zinc-700 font-bold">{job.tool.warrantyStatus}</div>
                </div>
              </div>

              {/* Accessories & Physical Condition */}
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="border border-black p-2 rounded">
                  <span className="font-bold block uppercase text-[10px] mb-1">ACCESSORIES RECEIVED AT COUNTER:</span>
                  <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                    {job.tool.accessoriesReceived.length === 0 ? (
                      <span className="text-zinc-500">None (Bare Tool Only)</span>
                    ) : (
                      job.tool.accessoriesReceived.map((acc, i) => (
                        <span key={i} className="bg-zinc-200 border border-zinc-400 px-1.5 py-0.5 rounded">
                          [✓] {acc}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-black p-2 rounded">
                  <span className="font-bold block uppercase text-[10px] mb-1">PHYSICAL CONDITION AT INTAKE:</span>
                  <span className="font-mono text-zinc-800">{job.tool.physicalCondition || 'Standard Jobsite Dust'}</span>
                </div>
              </div>

              {/* Grievance & Technical Instructions */}
              <div className="border-2 border-black p-3 rounded bg-zinc-50 space-y-1">
                <div className="flex justify-between font-bold text-[11px]">
                  <span className="uppercase text-black">DEFECT / GRIEVANCE: {job.serviceReq.grievanceCategory}</span>
                  <span className="font-mono">Pre-Approve Limit: ${job.serviceReq.preApprovedLimit.toFixed(2)}</span>
                </div>
                <p className="font-mono text-xs font-semibold leading-normal">{job.serviceReq.detailedComplaint}</p>
              </div>

              {/* Technician Diagnostic Checklist */}
              <div className="border border-black p-3 rounded space-y-2">
                <span className="font-extrabold uppercase text-[10px] block border-b border-black pb-1">
                  TECHNICIAN QUALITY &amp; SAFETY CHECKLIST (MARK ON SERVICE COMPLETION):
                </span>
                <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                  <div>[ ] Carbon Brushes Inspected</div>
                  <div>[ ] Armature Segment Test</div>
                  <div>[ ] Field Coil Ohms Check</div>
                  <div>[ ] Gearbox Grease Repacked</div>
                  <div>[ ] SDS Chuck Seal Lubricated</div>
                  <div>[ ] Cord Strain Relief Tight</div>
                  <div>[ ] On/Off Switch Lock-On</div>
                  <div>[ ] High Voltage Ground Test</div>
                  <div>[ ] 5-Min Full Load Test Run</div>
                </div>
              </div>

              {/* Parts Required & Shelf Bin Table */}
              {job.parts.length > 0 && (
                <div>
                  <span className="font-bold uppercase text-[10px] block mb-1">ALLOCATED SPARE PARTS (PICK FROM SHELF BINS):</span>
                  <table className="w-full text-left border-collapse text-[10px] font-mono border border-black">
                    <thead>
                      <tr className="bg-zinc-200 border-b border-black">
                        <th className="p-1">SKU</th>
                        <th className="p-1">Part Description</th>
                        <th className="p-1 text-center">Qty</th>
                        <th className="p-1 text-right">Unit Price</th>
                        <th className="p-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {job.parts.map((p, i) => (
                        <tr key={i} className="border-b border-zinc-300">
                          <td className="p-1 font-bold">{p.sku}</td>
                          <td className="p-1">{p.name}</td>
                          <td className="p-1 text-center font-bold">{p.quantity}</td>
                          <td className="p-1 text-right">${p.unitPrice.toFixed(2)}</td>
                          <td className="p-1 text-right">${p.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Technician Signature Block */}
              <div className="flex justify-between items-end pt-2 border-t border-black text-[10px]">
                <div>
                  Assigned Tech: <span className="font-bold">{job.technicianSignOffBy || job.technician}</span>
                </div>
                <div className="flex items-end gap-4 font-mono">
                  <div className="flex items-end gap-2">
                    <span>Tech Sign:</span>
                    {job.technicianSignature ? (
                      <img
                        src={job.technicianSignature}
                        alt="Technician Sign-Off"
                        className="h-8 object-contain border-b border-black px-1"
                      />
                    ) : (
                      <span>_____________________</span>
                    )}
                  </div>
                  <span>
                    Date:{' '}
                    {job.technicianSignOffAt
                      ? job.technicianSignOffAt.slice(0, 10)
                      : '____________'}
                  </span>
                </div>
              </div>

            </div>

            {/* CUT CUT CUT DIVIDER */}
            <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px] my-4">
              <span className="border-b border-dashed border-zinc-400 flex-1"></span>
              <span className="px-3 flex items-center gap-1">
                <Scissors className="w-3.5 h-3.5" /> CUT / TEAR HERE FOR CUSTOMER RECEIPT SLIP
              </span>
              <span className="border-b border-dashed border-zinc-400 flex-1"></span>
            </div>

            {/* PART 2: CUSTOMER RECEIPT & INVOICE SLIP (BOTTOM HALF) */}
            <div className="border border-black p-4 rounded space-y-4">
              
              <div className="flex justify-between items-start border-b border-black pb-3">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider font-mono">BOSCH AUTHORISED SERVICE CENTER</div>
                  <h2 className="text-lg font-black font-mono uppercase">CUSTOMER SERVICE RECEIPT</h2>
                  <p className="text-[10px] text-zinc-600">Industrial Estate, Bay 4 · Customer Service Line: (555) 019-2831</p>
                </div>

                <div className="text-right font-mono">
                  <div className="text-base font-bold">{job.id}</div>
                  <div className="text-[10px]">Date: {job.intakeDate}</div>
                </div>
              </div>

              {/* Customer & Tool Summary Grid */}
              <div className="grid grid-cols-2 gap-4 text-[11px] bg-zinc-50 p-3 border border-zinc-300 rounded">
                <div>
                  <span className="font-bold block uppercase text-[10px] text-zinc-700">CUSTOMER / COMPANY:</span>
                  <div className="font-bold text-sm">{job.customerName}</div>
                  <div>Phone: <span className="font-mono">{job.customerPhone}</span></div>
                  {job.customerCompany && <div>Company: {job.customerCompany}</div>}
                  {job.gstOrTaxId && <div className="font-mono text-[10px]">Tax ID: {job.gstOrTaxId}</div>}
                </div>

                <div>
                  <span className="font-bold block uppercase text-[10px] text-zinc-700">TOOL FOR REPAIR:</span>
                  <div className="font-bold text-sm">{job.tool.brand} {job.tool.modelNumber}</div>
                  <div className="font-mono">SN: {job.tool.serialNumber}</div>
                  <div>Warranty: {job.tool.warrantyStatus}</div>
                </div>
              </div>

              {/* Cost Summary + Customer Portal QR Code */}
              <div className="flex justify-between items-end gap-4 border-t border-black pt-3">
                <div className="flex items-center gap-3 border border-zinc-400 bg-zinc-50 p-2 rounded max-w-md">
                  <div className="bg-white p-1 border border-black shrink-0">
                    <svg
                      width="68"
                      height="68"
                      viewBox={`0 0 ${qr.size} ${qr.size}`}
                      shapeRendering="crispEdges"
                      aria-label={`Customer status QR code for ${job.id}`}
                    >
                      <rect width={qr.size} height={qr.size} fill="#ffffff" />
                      {qr.rows.map((row, rIdx) =>
                        row.map((dark, cIdx) =>
                          dark ? (
                            <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width={1} height={1} fill="#000000" />
                          ) : null
                        )
                      )}
                    </svg>
                  </div>
                  <div className="text-[10px] text-zinc-700 space-y-0.5 leading-snug">
                    <p className="font-bold text-black uppercase font-mono">Scan to Check Live Status</p>
                    <p>Point your phone camera here to open your Customer Portal receipt.</p>
                    <p className="font-mono font-bold text-black">Token: {accessToken}</p>
                  </div>
                </div>

                <div className="text-right font-mono text-xs space-y-1 shrink-0">
                  <div>Labor Charge: ${(job.laborHours * job.laborRate).toFixed(2)}</div>
                  <div>Parts Total: ${job.parts.reduce((s, p) => s + p.total, 0).toFixed(2)}</div>
                  <div>Tax ({job.taxRate}%): ${(((job.totalAmount * job.taxRate) / (100 + job.taxRate))).toFixed(2)}</div>
                  <div className="text-sm font-extrabold border-t border-black pt-1">
                    TOTAL ESTIMATE: ${job.totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Signature Line */}
              <div className="grid grid-cols-2 gap-8 pt-4 text-[10px]">
                <div>
                  <div className="font-bold mb-6">Customer Authorization Signature:</div>
                  {job.customerSignature ? (
                    <img src={job.customerSignature} alt="Customer Signature" className="h-8 object-contain mb-1" />
                  ) : (
                    <div className="border-b border-black h-8"></div>
                  )}
                  <div className="text-[9px] text-zinc-500">I authorize the above repair up to the pre-approved limit.</div>
                </div>

                <div>
                  <div className="font-bold mb-6">Counter Clerk Signature:</div>
                  <div className="border-b border-black h-8"></div>
                  <div className="text-[9px] text-zinc-500">Service Bay Authorised Stamp &amp; Date</div>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

      {/* Actual Print Styles for Browser Printing (window.print) */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          .no-print, header, footer, nav, button {
            display: none !important;
          }
          .printable-document {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          @page {
            margin: 10mm;
            size: A4 portrait;
          }
        }
      `}</style>

    </div>
  );
};
