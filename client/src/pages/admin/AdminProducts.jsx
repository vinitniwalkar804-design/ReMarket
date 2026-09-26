import { useState, useEffect } from "react";
import { Package, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/Loading.jsx";
import { imageProps } from "../../utils/images.js";
import { formatINR } from "../../utils/format.js";
import { listingTone } from "../../utils/theme.js";

const PAGE_SIZE = 15;

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    api
      .get(`/admin/products?page=${page}&limit=${PAGE_SIZE}`)
      .then(({ data }) => {
        setProducts(data.products || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page]);

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="page-eyebrow">
            <Layers size={12} /> Catalogue
          </span>
          <h1 className="page-title">Products</h1>
          <p className="page-sub">
            {loading ? "Loading catalogue…" : `${total} listing${total === 1 ? "" : "s"} across every seller`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="btn-icon"
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-2xs font-bold text-muted tabular px-1">
            {page} / {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages || loading}
            className="btn-icon"
            aria-label="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="panel p-5 space-y-3">
          {Array(6).fill(0).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <Package size={20} />
          </span>
          <h3 className="font-extrabold text-ink-900">No products found</h3>
          <p className="text-sm text-muted mt-1">Nothing has been listed on the marketplace yet.</p>
        </div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Seller</th>
                  <th className="th-num">Price</th>
                  <th className="th-num">Views</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-sunken rounded-lg overflow-hidden flex-none">
                          <img alt={p.title} {...imageProps(p)} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-sm font-semibold text-ink-900 line-clamp-1 max-w-[280px]">
                          {p.title}
                        </span>
                      </div>
                    </td>
                    <td className="text-muted">{p.categoryName || "—"}</td>
                    <td className="text-muted">{p.seller?.name || "—"}</td>
                    <td className="num">{formatINR(p.price)}</td>
                    <td className="num">{p.views ?? 0}</td>
                    <td>
                      <span className={`badge capitalize border ${listingTone(p.status)}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line bg-raised">
              <span className="text-2xs text-muted">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary btn-sm">
                  <ChevronLeft size={13} /> Prev
                </button>
                <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="btn-secondary btn-sm">
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
