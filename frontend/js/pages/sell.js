import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import toast from "../toast.js";
import auth from "../store/auth.js";
import Modal from "../components/modal.js";
import { formatINR, timeAgo } from "../utils/format.js";
import { imageProps } from "../utils/images.js";
import { listingTone } from "../utils/theme.js";
import { isModerated, listingLabel, listingStatusSentence, reasonLabel } from "../utils/moderation.js";

/**
 * Seller studio.
 *
 * Ported from `frontend/src/pages/Sell.jsx`: the same two tabs (create / manage),
 * the same upload rule (up to 4 photos, JPG/PNG/WebP, 8 MB, an image URL
 * alternative), the same client validations, and the same endpoints
 * (`GET /products/categories`, `POST /products`, `PUT /products/:id`,
 * `GET /products/my`, `DELETE /products/:id`, `POST /uploads`).
 *
 * The router has no unmount hook, so same teardown deal as Home/Products: a
 * body-level observer notices when this page's root leaves the document, then
 * the pending object-URLs are revoked and in-flight handlers stop painting. The
 * only other state React owned here was the mirror of what the customer typed,
 * which is kept in `st.form` and repainted into the small regions that depend
 * on it (photo grid, savings banner, condition chips, submit button).
 */

const conditions = ["Like New", "Good", "Average", "Used"];
const conditionTips = {
  "Like New": "Almost no signs of wear — used a few times.",
  Good: "Light wear, fully functional, well cared for.",
  Average: "Visible wear but works perfectly.",
  Used: "Heavy wear or cosmetic issues — priced to move.",
};

const emptyForm = () => ({
  title: "", description: "", category: "", brand: "", model: "", originalPrice: "",
  price: "", condition: "Good", negotiable: true, exchangeable: false, location: "", images: [],
});
const MAX_IMAGES = 4;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

export default function Sell({ location } = {}) {
  const st = {
    tab: "create",
    categories: [],
    loading: false,
    manageLoading: false,
    manage: [],
    imageUrl: "",
    editingId: null,
    form: emptyForm(),
    pendingImages: [],
    uploading: false,
    deleteTarget: null,
    deleting: false,
    deleteBlocked: null,
    scrollTimer: null,
  };

  // ---------- teardown ----------

  let disposed = false;
  const cleanups = [];

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      for (const fn of cleanups.splice(0)) fn();
    }
    return false;
  }

  cleanups.push(() => {
    if (st.scrollTimer) clearTimeout(st.scrollTimer);
    st.scrollTimer = null;
    // A route change while a photo upload is in flight must not leak the
    // preview blobs; the request itself is abandoned with the page.
    st.pendingImages.forEach((en) => URL.revokeObjectURL(en.blobUrl));
    st.pendingImages = [];
    st.deleteTarget = null;
    st.deleteBlocked = null;
  });

  // Reach the teardown even when no handler fires after the page is swapped out.
  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ---------- state transitions (React's setFoo + effects) ----------

  const setTab = (t) => {
    if (st.tab === t) return;
    st.tab = t;
    paint();
    // React: useEffect(() => { if (tab === "manage") loadManage(); }, [tab])
    if (t === "manage") loadManage();
  };

  const cancelEdit = () => {
    st.editingId = null;
    st.form = emptyForm();
    releasePending();
    st.uploading = false;
    createEl = buildCreate();
    seed();
    paint();
  };

  const releasePending = () => {
    st.pendingImages.forEach((en) => URL.revokeObjectURL(en.blobUrl));
    st.pendingImages = [];
  };

  // ---------- image handling ----------

  const paintGrid = () => {
    const refs = createEl.refs;
    const tiles = Array.from({ length: MAX_IMAGES }, (_, i) => {
      const urlImg = st.form.images[i];
      const pendingImg = urlImg === undefined ? st.pendingImages[i - st.form.images.length] : null;
      if (urlImg) {
        return h(
          "div",
          { key: `u-${i}`, className: "relative aspect-[4/3] rounded-xl overflow-hidden border border-line group" },
          h("img", { src: urlImg, alt: "", className: "w-full h-full object-cover" }),
          i === 0
            ? h("span", { className: "absolute left-2 top-2 badge bg-ink-900/70 text-white backdrop-blur" }, "Cover")
            : null,
          h(
            "button",
            {
              type: "button",
              onClick: () => removeImage(urlImg),
              className:
                "btn-icon absolute top-2 right-2 bg-ink-950/70 text-white backdrop-blur hover:bg-danger opacity-0 group-hover:opacity-100 transition-opacity",
              "aria-label": "Remove photo",
            },
            icon("X", { size: 14 })
          )
        );
      }
      if (pendingImg) {
        return h(
          "div",
          { key: pendingImg.key, className: "relative aspect-[4/3] rounded-xl overflow-hidden border border-line" },
          h("img", { src: pendingImg.blobUrl, alt: "", className: "w-full h-full object-cover opacity-60" }),
          h("div", { className: "absolute inset-0 flex items-center justify-center" }, icon("Loader2", { size: 22, className: "text-primary animate-spin" })),
          h(
            "button",
            {
              type: "button",
              onClick: () => removePendingImage(pendingImg.key),
              className: "btn-icon absolute top-2 right-2 bg-ink-950/70 text-white backdrop-blur hover:bg-danger",
              "aria-label": "Remove photo",
            },
            icon("X", { size: 14 })
          )
        );
      }
      return h(
        "button",
        {
          type: "button",
          key: `empty-${i}`,
          onClick: () => createEl?.refs?.fileInput?.click(),
          className:
            "aspect-[4/3] rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center gap-1.5 bg-raised hover:border-primary hover:bg-primary-soft transition-colors",
        },
        st.uploading ? icon("Loader2", { size: 20, className: "text-primary animate-spin" }) : icon("ImagePlus", { size: 20, className: "text-muted-soft" }),
        h("span", { className: "text-2xs font-bold text-muted" }, i === 0 ? "Main photo" : "Add photo")
      );
    });
    mount(refs.photosGrid, ...tiles);
    refs.countBadge.textContent = `${st.form.images.length + st.pendingImages.length}/${MAX_IMAGES}`;
  };

  const paintUploadButton = () => {
    const btn = createEl.refs.uploadBtn;
    btn.disabled = st.uploading;
    mount(btn, st.uploading ? [icon("Loader2", { size: 15, className: "animate-spin" }), " Uploading…"] : [icon("ImagePlus", { size: 15 }), " Upload photos"]);
  };

  const paintSubmit = () => {
    const btn = createEl.refs.submitBtn;
    const busy = st.loading || st.uploading;
    btn.disabled = busy;
    mount(btn, busy ? [icon("Loader2", { size: 16, className: "animate-spin" }), " Working…"] : [st.editingId ? "Save changes" : "Publish listing", " ", icon("ArrowRight", { size: 16 })]);
  };

  /** Photos, count badge, upload button and submit button — the regions React
   *  re-created whenever `images`/`pendingImages`/`uploading` changed. */
  const paintDynamic = () => {
    paintGrid();
    paintUploadButton();
    paintSubmit();
  };

  const paintSavings = () => {
    const original = Number(st.form.originalPrice) || 0;
    const ask = Number(st.form.price) || 0;
    const savings = Math.max(0, original - ask);
    const savingsPct = original > 0 ? Math.round((savings / original) * 100) : 0;
    if (!(savings > 0)) {
      mount(createEl.refs.savings);
      return;
    }
    mount(
      createEl.refs.savings,
      h(
        "div",
        { className: "flex items-center gap-3 rounded-xl border border-success/25 bg-success-soft px-4 py-3" },
        icon("TrendingDown", { size: 16, className: "text-success flex-none" }),
        h(
          "p",
          { className: "text-xs text-ink-800" },
          "Shoppers see ",
          h("span", { className: "font-extrabold text-success tabular" }, `-${savingsPct}%`),
          " — ",
          h("span", { className: "text-muted" }, `${formatINR(original)} → ${formatINR(ask)}, saving ${formatINR(savings)}.`)
        )
      )
    );
  };

  const chipNodes = () =>
    conditions.map((c) =>
      h(
        "button",
        {
          type: "button",
          key: c,
          onClick: () => {
            st.form.condition = c;
            paintCondition();
          },
          className: `chip ${st.form.condition === c ? "chip-active" : "chip-idle"}`,
        },
        c
      )
    );

  const paintCondition = () => {
    mount(createEl.refs.chips, ...chipNodes());
    createEl.refs.tip.textContent = conditionTips[st.form.condition];
  };

  const addImage = () => {
    const value = st.imageUrl.trim();
    if (!value) return;
    if (st.form.images.length >= MAX_IMAGES) return toast.error(`You can add up to ${MAX_IMAGES} photos`);
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return toast.error("Enter a valid image URL");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return toast.error("Image URL must use http or https");
    st.form.images = [...st.form.images, value];
    st.imageUrl = "";
    if (createEl?.refs?.imageUrlInput) createEl.refs.imageUrlInput.value = "";
    paintDynamic();
  };

  const removePendingImage = (key) => {
    const target = st.pendingImages.find((x) => x.key === key);
    if (target) URL.revokeObjectURL(target.blobUrl);
    st.pendingImages = st.pendingImages.filter((x) => x.key !== key);
    paintDynamic();
  };

  const removeImage = (src) => {
    st.form.images = st.form.images.filter((x) => x !== src);
    paintDynamic();
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith("image/") && f.size <= MAX_FILE_SIZE);
    if (!imageFiles.length) return toast.error("Choose JPG, PNG, or WebP images up to 8 MB");
    const used = st.form.images.length + st.pendingImages.length;
    const room = Math.max(0, MAX_IMAGES - used);
    if (room === 0) return toast.error(`You can add up to ${MAX_IMAGES} photos`);
    const accepted = imageFiles.slice(0, room);
    if (files.length !== imageFiles.length)
      toast.error("Some files were skipped; use JPG, PNG, or WebP images up to 8 MB");
    if (imageFiles.length > room) toast.error(`Up to ${MAX_IMAGES} photos — skipped ${imageFiles.length - room}`);
    if (!accepted.length) return;
    const entries = accepted.map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      blobUrl: URL.createObjectURL(file),
    }));
    st.pendingImages = [...st.pendingImages, ...entries];
    st.uploading = true;
    paintDynamic();
    const fd = new FormData();
    entries.forEach((en) => fd.append("images", en.file));
    try {
      const { data } = await api.post("/uploads", fd);
      const urls = (data.urls || []).filter(Boolean);
      if (!urls.length) throw new Error(data.message || "Upload returned no URLs");
      st.form.images = [...st.form.images, ...urls];
      entries.forEach((en) => URL.revokeObjectURL(en.blobUrl));
      st.pendingImages = st.pendingImages.filter((en) => !entries.includes(en));
      if (ensureAlive()) toast.success(`${urls.length} photo${urls.length === 1 ? "" : "s"} uploaded`);
    } catch (err) {
      entries.forEach((en) => URL.revokeObjectURL(en.blobUrl));
      st.pendingImages = st.pendingImages.filter((en) => !entries.includes(en));
      if (ensureAlive()) toast.error(err?.response?.data?.message || "Image upload failed — please try again");
    } finally {
      st.uploading = false;
      if (!ensureAlive()) return;
      paintDynamic();
      if (createEl?.refs?.fileInput) createEl.refs.fileInput.value = "";
    }
  };

  // ---------- listing save / manage ----------

  const startEdit = (p) => {
    st.tab = "create";
    st.editingId = p._id;
    releasePending();
    st.uploading = false;
    st.form = {
      title: p.title, description: p.description || "", category: p.category, brand: p.brand || "", model: p.model || "",
      originalPrice: p.originalPrice || "", price: p.price, condition: p.condition, negotiable: p.negotiable,
      exchangeable: p.exchangeable, location: p.location || "", images: (p.images || []).filter(Boolean),
    };
    createEl = buildCreate();
    seed();
    paint();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const title = st.form.title.trim();
    const description = st.form.description.trim();
    const price = Number(st.form.price);
    const originalPrice = st.form.originalPrice === "" ? Math.round(price * 1.3) : Number(st.form.originalPrice);
    if (!auth.user) return toast.error("Please log in before listing an item");
    if (!title || !description || !st.form.category)
      return toast.error("Title, description, and category are required");
    if (!Number.isFinite(price) || price <= 0) return toast.error("Enter a valid selling price");
    if (!Number.isFinite(originalPrice) || originalPrice <= 0) return toast.error("Enter a valid original price");
    if (originalPrice < price) return toast.error("Original price cannot be lower than the selling price");
    if (st.uploading || st.pendingImages.length > 0) return toast.error("Wait for photos to finish uploading");
    st.loading = true;
    paintSubmit();
    try {
      const payload = {
        ...st.form,
        title,
        description,
        originalPrice,
        price,
        location: st.form.location.trim() || auth.user?.location || "",
      };
      if (st.editingId) {
        await api.put(`/products/${st.editingId}`, payload);
        toast.success("Listing updated!");
      } else {
        await api.post("/products", payload);
        toast.success("Product listed!");
        st.scrollTimer = setTimeout(() => window.scrollTo({ top: 0 }), 0);
      }
      setTab("manage");
      cancelEdit();
      loadManage();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save listing");
    } finally {
      st.loading = false;
      if (ensureAlive()) paintSubmit();
    }
  };

  const toggleStatus = async (p) => {
    const next = p.status === "available" ? "sold" : "available";
    try {
      await api.put(`/products/${p._id}`, { status: next });
      toast.success(next === "sold" ? "Marked as sold" : "Back on the market");
      loadManage();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed");
    }
  };

  const closeDelete = () => {
    st.deleteTarget = null;
    st.deleteBlocked = null;
    paintModal();
  };

  const performDelete = async () => {
    if (!st.deleteTarget) return;
    st.deleting = true;
    paintModal();
    try {
      await api.delete(`/products/${st.deleteTarget._id}`);
      st.manage = st.manage.filter((x) => x._id !== st.deleteTarget._id);
      toast.success("Listing deleted");
      st.deleteTarget = null;
    } catch (err) {
      const code = err?.response?.status;
      /* 409 is the interesting one: the server refuses because the listing has
         history. Show the actual blockers rather than "try again", because
         retrying will never succeed and the seller's next step is different. */
      const blockers = err?.response?.data?.blockers;
      if (code === 401) toast.error("Please log in again.");
      else if (code === 403) toast.error("You can only delete your own listings.");
      else if (code === 404) toast.error("This listing no longer exists.");
      else if (code === 409 && blockers?.length) {
        const summary = blockers.map((b) => `${b.count} ${b.label}${b.count === 1 ? "" : "s"}`).join(", ");
        st.deleteBlocked = { summary, hint: err.response.data.hint };
        toast.error("This listing has history attached");
      } else if (code === 409) toast.error(err?.response?.data?.message || "This listing cannot be deleted yet.");
      else toast.error("Unable to delete the listing right now. Please try again.");
    }
    st.deleting = false;
    if (!ensureAlive()) return;
    paintModal();
    paint();
  };

  const loadManage = async () => {
    st.manageLoading = true;
    if (ensureAlive() && st.tab === "manage") paint();
    try {
      const { data } = await api.get("/products/my");
      if (!ensureAlive()) return;
      st.manage = data.products || [];
    } catch {
      if (!ensureAlive()) return;
    }
    st.manageLoading = false;
    if (ensureAlive()) paint();
  };

  const loadCategories = () => {
    api
      .get("/products/categories")
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.categories = data.categories || [];
        refreshCategoryOptions();
      })
      .catch(() => {
        /* categories load is cosmetic - validation still works without them */
      });
  };

  const refreshCategoryOptions = () => {
    const select = createEl?.refs?.catSelect;
    if (!select) return;
    select.replaceChildren(
      h("option", { value: "" }, "Select category"),
      ...st.categories.map((c) => h("option", { value: c._id }, c.name))
    );
    select.value = st.form.category;
  };

  // ---------- build: create / edit form ----------

  const buildCreate = () => {
    const refs = {};

    const editBanner = st.editingId
      ? h(
          "div",
          { className: "lg:col-span-12 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-primary-soft px-4 py-3" },
          h("span", { className: "text-sm font-bold text-primary" }, "Editing an existing listing"),
          h("button", { type: "button", onClick: cancelEdit, className: "text-xs font-bold text-primary hover:underline" }, "Discard & start fresh")
        )
      : null;

    // ---------- photos ----------
    refs.countBadge = h("span", { className: "badge-neutral" });
    const photosHead = h(
      "div",
      { className: "panel-head" },
      h(
        "div",
        null,
        h("h2", { className: "panel-title" }, "Photos"),
        h("p", { className: "panel-sub" }, `Up to ${MAX_IMAGES} images · JPG, PNG or WebP · 8 MB each`)
      ),
      refs.countBadge
    );

    refs.photosGrid = h("div", { className: "grid grid-cols-2 gap-3" });

    refs.fileInput = h("input", { type: "file", accept: "image/*", multiple: true, className: "hidden", onChange: handleFiles });

    refs.uploadBtn = h("button", { type: "button", onClick: () => refs.fileInput.click(), disabled: st.uploading, className: "btn-secondary" });

    refs.imageUrlInput = h("input", {
      className: "input-field flex-1 min-w-[180px]",
      placeholder: "Paste an image URL",
      onInput: (e) => {
        st.imageUrl = e.target.value;
      },
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addImage();
        }
      },
    });
    const addBtn = h("button", { type: "button", onClick: addImage, className: "btn-secondary shrink-0" }, icon("Link2", { size: 15 }), " Add");

    const photosSection = h(
      "section",
      { className: "lg:col-span-7 panel" },
      photosHead,
      h(
        "div",
        { className: "panel-body space-y-4" },
        refs.photosGrid,
        refs.fileInput,
        h(
          "div",
          { className: "flex flex-wrap items-center gap-2" },
          refs.uploadBtn,
          h("span", { className: "text-2xs text-muted-soft font-bold uppercase tracking-[0.1em]" }, "or"),
          refs.imageUrlInput,
          addBtn
        )
      )
    );

    // ---------- details ----------
    const titleInput = h("input", {
      className: "input-field",
      placeholder: "e.g. iPhone 13 128GB — 9/10 condition",
      required: true,
      maxLength: 100,
      value: st.form.title,
      onInput: (e) => {
        st.form.title = e.target.value;
      },
    });
    refs.titleInput = titleInput;

    const descArea = h("textarea", {
      className: "textarea-field",
      rows: 4,
      placeholder: "Condition details, accessories, why you're selling…",
      required: true,
      value: st.form.description,
      onInput: (e) => {
        st.form.description = e.target.value;
      },
    });
    refs.descArea = descArea;

    refs.catSelect = h(
      "select",
      {
        className: "select-field",
        required: true,
        value: st.form.category,
        onChange: (e) => {
          st.form.category = e.target.value;
        },
      },
      h("option", { value: "" }, "Select category"),
      ...st.categories.map((c) => h("option", { value: c._id }, c.name))
    );

    refs.chips = h("div", { className: "flex flex-wrap gap-2" });
    refs.tip = h("p", { className: "input-hint" });

    const brandInput = h("input", {
      className: "input-field",
      placeholder: "Apple, Samsung…",
      value: st.form.brand,
      onInput: (e) => {
        st.form.brand = e.target.value;
      },
    });
    refs.brandInput = brandInput;

    const modelInput = h("input", {
      className: "input-field",
      placeholder: "Model / variant",
      value: st.form.model,
      onInput: (e) => {
        st.form.model = e.target.value;
      },
    });
    refs.modelInput = modelInput;

    const basicsPanel = h(
      "div",
      { className: "panel" },
      h(
        "div",
        { className: "panel-head" },
        h("div", null, h("h2", { className: "panel-title" }, "The basics"), h("p", { className: "panel-sub" }, "What is it, and what condition is it in?"))
      ),
      h(
        "div",
        { className: "panel-body space-y-4" },
        h("div", null, h("label", { className: "input-label" }, "Title *"), titleInput),
        h("div", null, h("label", { className: "input-label" }, "Description *"), descArea),
        h("div", null, h("label", { className: "input-label" }, "Category *"), refs.catSelect),
        h(
          "div",
          null,
          h("label", { className: "input-label" }, "Condition"),
          refs.chips,
          refs.tip
        ),
        h(
          "div",
          { className: "grid grid-cols-2 gap-3" },
          h("div", null, h("label", { className: "input-label" }, "Brand"), brandInput),
          h("div", null, h("label", { className: "input-label" }, "Model"), modelInput)
        )
      )
    );

    // ---------- price & terms ----------
    const originalInput = h("input", {
      type: "number",
      value: st.form.originalPrice,
      className: "input-field",
      placeholder: "What you paid",
      onInput: (e) => {
        st.form.originalPrice = e.target.value;
        paintSavings();
      },
    });
    refs.originalInput = originalInput;

    const priceInput = h("input", {
      type: "number",
      value: st.form.price,
      className: "input-field",
      placeholder: "Your price",
      required: true,
      onInput: (e) => {
        st.form.price = e.target.value;
        paintSavings();
      },
    });
    refs.priceInput = priceInput;

    refs.savings = h("div");

    const locInput = h("input", {
      className: "input-field pl-10",
      placeholder: "City / locality",
      value: st.form.location,
      onInput: (e) => {
        st.form.location = e.target.value;
      },
    });
    refs.locInput = locInput;

    const negotiableCb = h("input", {
      type: "checkbox",
      checked: st.form.negotiable,
      onChange: (e) => {
        st.form.negotiable = e.target.checked;
      },
    });
    refs.negotiableCb = negotiableCb;

    const exchangeableCb = h("input", {
      type: "checkbox",
      checked: st.form.exchangeable,
      onChange: (e) => {
        st.form.exchangeable = e.target.checked;
      },
    });
    refs.exchangeableCb = exchangeableCb;

    const pricePanel = h(
      "div",
      { className: "panel" },
      h(
        "div",
        { className: "panel-head" },
        h(
          "div",
          null,
          h("h2", { className: "panel-title flex items-center gap-2" }, icon("Tag", { size: 16, className: "text-primary" }), " Price & terms"),
          h("p", { className: "panel-sub" }, "Pricing relative to original retail is your strongest hook.")
        )
      ),
      h(
        "div",
        { className: "panel-body space-y-4" },
        h(
          "div",
          { className: "grid grid-cols-2 gap-3" },
          h("div", null, h("label", { className: "input-label" }, "Original price (₹)"), originalInput),
          h("div", null, h("label", { className: "input-label" }, "Selling price (₹) *"), priceInput)
        ),
        refs.savings,
        h(
          "div",
          null,
          h("label", { className: "input-label" }, "Location"),
          h(
            "div",
            { className: "relative" },
            h("span", { className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" }, icon("MapPin", { size: 16 })),
            locInput
          )
        ),
        h(
          "div",
          { className: "grid sm:grid-cols-2 gap-2" },
          h("label", { className: "checkbox-row" }, negotiableCb, h("span", null, "Open to offers")),
          h("label", { className: "checkbox-row" }, exchangeableCb, h("span", null, "Accept exchange"))
        )
      )
    );

    const detailsSection = h("section", { className: "lg:col-span-5 space-y-6" }, basicsPanel, pricePanel);

    // ---------- submit bar ----------
    refs.submitBtn = h("button", { type: "submit", className: "btn-primary btn-lg sm:w-auto w-full" });

    const submitBar = h(
      "div",
      { className: "lg:col-span-12 flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-line bg-surface p-5" },
      h("span", { className: "w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center flex-none" }, icon("CheckCircle2", { size: 17 })),
      h(
        "p",
        { className: "text-xs text-muted leading-relaxed flex-1" },
        "Listing is free and stays live until sold. Buyers can compare, negotiate and chat before committing — you keep control of the final price."
      ),
      refs.submitBtn
    );

    const form = h(
      "form",
      { onSubmit: handleSubmit, className: "grid lg:grid-cols-12 gap-6" },
      editBanner,
      photosSection,
      detailsSection,
      submitBar
    );

    return { form, refs };
  };

  // ---------- build: manage tab ----------

  const manageCard = (p) =>
    h(
      "article",
      { key: p._id, className: "card-interactive p-4 flex flex-col gap-3" },
      h(
        "div",
        { className: "flex gap-4" },
        h(
          "a",
          { href: `/products/${p._id}`, className: "w-20 h-20 rounded-xl overflow-hidden bg-sunken flex-none" },
          h("img", { ...imageProps(p), className: "w-full h-full object-cover" })
        ),
        h(
          "div",
          { className: "flex-1 min-w-0" },
          h("a", { href: `/products/${p._id}`, className: "font-bold text-sm text-ink-900 hover:text-primary line-clamp-1" }, p.title),
          h(
            "div",
            { className: "flex items-center flex-wrap gap-x-3 gap-y-1 text-2xs text-muted mt-1.5" },
            h("span", { className: "text-sm font-extrabold text-primary tabular" }, formatINR(p.price)),
            p.originalPrice > p.price ? h("span", { className: "text-muted-soft line-through tabular" }, formatINR(p.originalPrice)) : null,
            h("span", { className: "inline-flex items-center gap-1" }, icon("Eye", { size: 11 }), " ", p.views ?? 0),
            h("span", { className: "inline-flex items-center gap-1" }, icon("Heart", { size: 11 }), " ", p.wishlistCount ?? 0),
            h("span", { className: "inline-flex items-center gap-1" }, icon("Scale", { size: 11 }), " ", p.compareCount ?? 0)
          ),
          h("p", { className: "text-2xs text-muted-soft mt-1" }, timeAgo(p.createdAt))
        )
      ),
      h(
        "div",
        { className: "flex items-center gap-2 flex-wrap pt-3 border-t border-line" },
        h("span", { className: `badge border ${listingTone(p.status)}` }, listingLabel(p.status)),
        h(
          "div",
          { className: "flex items-center gap-1.5 ml-auto" },
          h("button", { type: "button", onClick: () => startEdit(p), className: "btn-ghost btn-sm" }, icon("Pencil", { size: 12 }), " Edit"),
          /* A moderated listing can still be corrected, but the seller cannot
             flip it back to live or mark it sold - only a moderator can. */
          isModerated(p.status)
            ? h("span", { className: "text-2xs text-muted-soft" }, "Awaiting moderator review")
            : p.status !== "removed"
              ? p.status === "sold"
                ? h("button", { type: "button", onClick: () => toggleStatus(p), className: "btn-secondary btn-sm" }, icon("PackageCheck", { size: 13 }), " Relist")
                : h("button", { type: "button", onClick: () => toggleStatus(p), className: "btn-secondary btn-sm" }, icon("PackageX", { size: 13 }), " Mark sold")
              : null,
          h(
            "button",
            { type: "button", onClick: () => openDelete(p), className: "btn-ghost btn-sm text-danger hover:bg-danger-soft" },
            icon("Trash2", { size: 12 })
          )
        )
      ),
      isModerated(p.status)
        ? h(
            "div",
            { className: `alert ${p.status === "hidden" ? "alert-warning" : "alert-danger"} mt-3 !py-2.5` },
            icon("ShieldAlert", { size: 15, className: "flex-none mt-0.5" }),
            h(
              "div",
              { className: "space-y-1" },
              h(
                "p",
                { className: "text-xs font-bold leading-relaxed" },
                listingStatusSentence(p),
                p.moderationReason ? ` Reason: ${reasonLabel(p.moderationReason)}.` : ""
              ),
              p.moderationNote
                ? h("p", { className: "text-2xs leading-relaxed opacity-90" }, `Note from the moderation team: ${p.moderationNote}`)
                : null,
              h(
                "p",
                { className: "text-2xs leading-relaxed opacity-90" },
                "You can edit the details above, then a moderator can restore it to live once it meets the listing policy."
              )
            )
          )
        : null
    );

  const openDelete = (p) => {
    st.deleteBlocked = null;
    st.deleteTarget = p;
    paintModal();
  };

  const paintModal = () => {
    if (!st.deleteTarget) {
      mount(modalHost);
      return;
    }
    const children = h(
      "div",
      null,
      h(
        "div",
        { className: "flex items-start gap-3" },
        h("span", { className: "w-10 h-10 rounded-xl bg-danger-soft text-danger flex items-center justify-center flex-none" }, icon("Trash", { size: 18 })),
        h(
          "div",
          null,
          h("p", { className: "text-sm font-bold text-ink-900" }, st.deleteTarget.title),
          h("p", { className: "text-sm text-muted mt-1" }, "This product will be removed from your marketplace listings. This action cannot be undone.")
        )
      ),
      st.deleteBlocked
        ? h(
            "div",
            { className: "alert alert-warning mt-4" },
            icon("Info", { size: 15, className: "flex-none mt-0.5" }),
            h(
              "div",
              null,
              h("p", { className: "text-xs font-bold leading-relaxed" }, `This listing already has ${st.deleteBlocked.summary}, so it cannot be removed.`),
              st.deleteBlocked.hint
                ? h("p", { className: "text-2xs leading-relaxed opacity-90 mt-1" }, st.deleteBlocked.hint)
                : null
            )
          )
        : null,
      h(
        "div",
        { className: "mt-5 flex items-center gap-3" },
        h("button", { type: "button", onClick: closeDelete, disabled: st.deleting, className: "btn-secondary flex-1" }, st.deleteBlocked ? "Close" : "Cancel"),
        h(
          "button",
          { type: "button", onClick: performDelete, disabled: st.deleting || !!st.deleteBlocked, className: "btn-danger flex-1" },
          st.deleting ? [icon("Loader2", { size: 15, className: "animate-spin" }), " Deleting…"] : "Delete listing"
        )
      )
    );
    mount(modalHost, Modal({ onClose: closeDelete, title: "Delete this listing?", children }));
  };

  const renderManage = () => {
    const header = h(
      "div",
      { className: "flex items-end justify-between gap-3 flex-wrap" },
      h(
        "div",
        null,
        h("h2", { className: "section-title" }, "Your listings"),
        h("p", { className: "section-sub" }, "Edit, mark sold or remove anything you've posted.")
      ),
      h("button", { type: "button", onClick: () => setTab("create"), className: "btn-primary" }, icon("Plus", { size: 15 }), " List an item")
    );

    let body;
    if (st.manageLoading) {
      body = h(
        "div",
        { className: "space-y-3" },
        Array.from({ length: 3 }, (_, i) => h("div", { key: i, className: "h-32 rounded-2xl border border-line bg-surface animate-pulse" }))
      );
    } else if (st.manage.length === 0) {
      body = h(
        "div",
        { className: "panel p-12 text-center" },
        h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("LayoutGrid", { size: 22 })),
        h("h3", { className: "font-extrabold text-ink-900" }, "No listings yet"),
        h("p", { className: "text-sm text-muted mt-1 max-w-sm mx-auto" }, "List your first item and manage it right here — edit, mark sold or remove."),
        h("button", { type: "button", onClick: () => setTab("create"), className: "btn-primary mt-5" }, icon("Plus", { size: 15 }), " List an item")
      );
    } else {
      body = h(
        "div",
        { className: "grid md:grid-cols-2 xl:grid-cols-3 gap-4" },
        st.manage.map((p) => manageCard(p))
      );
    }

    const info = h(
      "div",
      { className: "flex items-start gap-3 rounded-2xl border border-line bg-raised p-4" },
      icon("Info", { size: 15, className: "text-muted flex-none mt-0.5" }),
      h(
        "p",
        { className: "text-2xs text-muted leading-relaxed" },
        "Marking a listing as sold keeps it visible as a reference for your rating history. Deleting removes it permanently and cannot be undone."
      )
    );

    return h("div", { className: "space-y-4" }, header, body, info);
  };

  // ---------- paint ----------

  /** Repaint every derived region of the current create form after it is (re)built. */
  const seed = () => {
    if (!createEl) return;
    paintGrid();
    paintCondition();
    paintSavings();
    paintUploadButton();
    paintSubmit();
  };

  const paintMastheadButtons = () => {
    mount(
      mastheadButtons,
      h(
        "button",
        {
          type: "button",
          onClick: () => {
            setTab("create");
            if (st.editingId) cancelEdit();
          },
          className: `btn ${st.tab === "create" ? "btn-primary" : "btn-secondary"}`,
        },
        icon("Plus", { size: 15 }),
        " ",
        st.editingId ? "Editing listing" : "List an item"
      ),
      h(
        "button",
        { type: "button", onClick: () => setTab("manage"), className: `btn ${st.tab === "manage" ? "btn-primary" : "btn-secondary"}` },
        icon("LayoutGrid", { size: 15 }),
        " Manage listings",
        st.manage.length > 0 ? h("span", { className: "badge-neutral" }, String(st.manage.length)) : null
      )
    );
  };

  function paint() {
    // Not guarded with ensureAlive(): paint() runs synchronously during init,
    // before the router has mounted this root, and an `isConnected` check would
    // mistake that for a detach and dispose the page before it is ever shown.
    // Every async path guards itself before calling paint().
    mount(bodySlot, st.tab === "create" ? createEl.form : renderManage());
    paintMastheadButtons();
  }

  // ---------- page shell ----------

  const mastheadButtons = h("div", { className: "flex flex-col sm:flex-row gap-2" });

  // React's layout: icon tile, head line, then the tab buttons, all in a row
  // that wraps on small screens.
  const masthead = h(
    "header",
    { className: "page-masthead" },
    h(
      "div",
      { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10" },
      h(
        "div",
        { className: "flex flex-col sm:flex-row sm:items-center gap-5" },
        h("span", { className: "icon-tile-primary" }, icon("Sparkles", { size: 22 })),
        h(
          "div",
          { className: "flex-1" },
          h("h1", { className: "page-title" }, "Seller studio"),
          h(
            "p",
            { className: "page-sub max-w-2xl" },
            "Honest listings sell faster. Clear photos and an accurate condition note reliably bring in more — and better — offers."
          )
        ),
        mastheadButtons
      )
    )
  );

  const bodySlot = h("div", { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10" });
  const modalHost = h("div");
  const root = h("div", { className: "animate-fade-in" }, masthead, bodySlot, modalHost);

  let createEl = null;

  // React: useEffect(() => { const p = location.state?.editProduct; ... }, [location.state])
  const editProduct = location?.state?.editProduct;
  if (editProduct) {
    st.tab = "create";
    st.form = {
      title: editProduct.title, description: editProduct.description || "", category: editProduct.category,
      brand: editProduct.brand || "", model: editProduct.model || "",
      originalPrice: editProduct.originalPrice || "", price: editProduct.price, condition: editProduct.condition,
      negotiable: editProduct.negotiable, exchangeable: editProduct.exchangeable, location: editProduct.location || "",
      images: (editProduct.images || []).filter(Boolean),
    };
    st.editingId = editProduct._id;
    window.history.replaceState({}, "");
  }

  // First paint: fresh create form (or the product the profile told us to edit),
  // then the derived regions and the async loads React kicked off on mount.
  createEl = buildCreate();
  seed();
  paint();
  loadCategories();

  return root;
}