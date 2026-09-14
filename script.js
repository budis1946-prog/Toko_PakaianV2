// ==========================================
// SCRIPT FRONTEND - GITHUB PAGES
// Google Apps Script + Google Sheets
// Tanpa fetch CORS: baca = JSONP, tulis = HTML form POST
// ==========================================

const API_URL = "https://script.google.com/macros/s/AKfycby-YlkfI-Z1bwiK0ujaY-ArD0BSgw5BlNVqYFmeB0IGA09DHUFOEDEJbVBmVFesZ3d_KQ/exec";

const $ = (id) => document.getElementById(id);

const rupiah = (n) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(Number(n) || 0);

let products = [];
let jsonpCounter = 0;

document.addEventListener("DOMContentLoaded", () => {
  $("openFormBtn").addEventListener("click", openAdd);
  $("closeFormBtn").addEventListener("click", closeModal);
  $("cancelBtn").addEventListener("click", closeModal);
  $("productForm").addEventListener("submit", saveProduct);
  $("searchInput").addEventListener("input", render);
  $("hargaBeli").addEventListener("input", updatePreview);
  $("hargaJual").addEventListener("input", updatePreview);
  $("jumlahTerjual").addEventListener("input", updatePreview);
  $("foto").addEventListener("change", previewPhoto);

  createWriteFrame();
  loadProducts();
});

function ensureApi() {
  if (!API_URL || API_URL.includes("GANTI_DENGAN")) {
    alert("Isi API_URL di script.js dengan URL Web App Google Apps Script.");
    return false;
  }
  return true;
}

// =============================
// BACA DATA - JSONP
// =============================

function loadProducts() {
  if (!ensureApi()) return;

  $("productTableBody").innerHTML =
    '<tr><td colspan="10">Memuat data...</td></tr>';

  const callbackName = "__produkCallback_" + (++jsonpCounter);

  window[callbackName] = function(response) {
    try {
      if (!response || !response.success) {
        throw new Error(response?.message || "Gagal mengambil data");
      }

      products = Array.isArray(response.data) ? response.data : [];
      render();
    } catch (err) {
      showLoadError(err.message);
    } finally {
      delete window[callbackName];
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }
  };

  const script = document.createElement("script");
  script.src =
    API_URL +
    "?action=list&callback=" +
    encodeURIComponent(callbackName) +
    "&_=" +
    Date.now();

  script.onerror = function() {
    delete window[callbackName];
    showLoadError("API tidak dapat diakses. Periksa URL Web App dan deployment.");
    if (script.parentNode) script.parentNode.removeChild(script);
  };

  document.body.appendChild(script);
}

function showLoadError(message) {
  $("productTableBody").innerHTML =
    `<tr><td colspan="10">Gagal memuat data: ${escapeHtml(message)}</td></tr>`;
}

// =============================
// TULIS DATA - FORM POST
// Tidak memakai fetch sehingga GitHub Pages
// tidak terkena masalah CORS/preflight.
// =============================

function createWriteFrame() {
  if (document.getElementById("apiWriteFrame")) return;

  const iframe = document.createElement("iframe");
  iframe.name = "apiWriteFrame";
  iframe.id = "apiWriteFrame";
  iframe.style.display = "none";
  document.body.appendChild(iframe);
}

function submitToApi(action, payload) {
  return new Promise((resolve, reject) => {
    if (!ensureApi()) {
      reject(new Error("API belum dikonfigurasi"));
      return;
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = API_URL;
    form.target = "apiWriteFrame";
    form.style.display = "none";

    const data = { action, ...payload };

    Object.keys(data).forEach((key) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = data[key] == null ? "" : String(data[key]);
      form.appendChild(input);
    });

    document.body.appendChild(form);

    // Form submission ke Apps Script tidak diblokir CORS.
    form.submit();

    // Beri waktu Apps Script menyelesaikan penulisan ke Sheets,
    // lalu baca ulang database.
    setTimeout(() => {
      form.remove();
      resolve();
    }, 1200);
  });
}

function getImageUrl(value) {
  if (!value) return "";

  const url = String(value).trim();

  // Base64
  if (url.startsWith("data:image/")) {
    return url;
  }

  // Ambil File ID Google Drive
  let fileId = "";

  // https://drive.google.com/file/d/FILE_ID/view
  let match = url.match(/\/file\/d\/([-\w]{20,})/i);

  if (match && match[1]) {
    fileId = match[1];
  }

  // https://drive.google.com/open?id=FILE_ID
  if (!fileId) {
    match = url.match(/[?&]id=([-\w]{20,})/i);

    if (match && match[1]) {
      fileId = match[1];
    }
  }

  // https://drive.google.com/uc?id=FILE_ID
  if (!fileId) {
    match = url.match(/\/d\/([-\w]{20,})/i);

    if (match && match[1]) {
      fileId = match[1];
    }
  }

  // Gunakan URL Google Drive yang lebih cocok untuk <img>
  if (fileId) {
    return "https://drive.google.com/uc?export=view&id=" +
      encodeURIComponent(fileId);
  }

  // Jika bukan URL Drive, gunakan apa adanya
  return url;
}

// =============================
// RENDER
// =============================

function render() {
  const q = $("searchInput").value.trim().toLowerCase();

  const filtered = products.filter((p) =>
    [p.nama, p.kategori, p.deskripsi]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );

  $("emptyState").style.display = filtered.length ? "none" : "block";

  $("productTableBody").innerHTML = filtered.map((p) => {
    const margin =
      (Number(p.hargaJual) || 0) - (Number(p.hargaBeli) || 0);
    const terjual = Number(p.terjual) || 0;
    const laba = margin * terjual;

    return `
      <tr>
        <td>
          ${
  p.gambar
    ? `<img
         class="product-img"
         src="${escapeAttr(getImageUrl(p.gambar))}"
         alt="${escapeAttr(p.nama || "Foto produk")}"
         loading="lazy"
         onerror="this.onerror=null; this.src='https://via.placeholder.com/80x80?text=No+Image'"
       >`
    : '<div class="product-img"></div>'
}
        </td>
        <td><strong>${escapeHtml(p.nama)}</strong></td>
        <td>${escapeHtml(p.kategori || "-")}</td>
        <td>${rupiah(p.hargaBeli)}</td>
        <td>${rupiah(p.hargaJual)}</td>
        <td>${Number(p.stok) || 0}</td>
        <td>${terjual}</td>
        <td>${rupiah(margin)}</td>
        <td>${rupiah(laba)}</td>
        <td>${escapeHtml(p.deskripsi || "-")}</td>
        <td>
          <button class="action-btn" onclick="openEdit('${escapeAttr(p.id)}')">
            Edit
          </button>
          <button class="action-btn action-delete"
                  onclick="deleteProduct('${escapeAttr(p.id)}')">
            Hapus
          </button>
        </td>
      </tr>
    `;
  }).join("");

  $("totalProduk").textContent = products.length;

  $("totalTerjual").textContent = products.reduce(
    (sum, p) => sum + (Number(p.terjual) || 0),
    0
  );

  $("totalPenjualan").textContent = rupiah(
    products.reduce(
      (sum, p) =>
        sum +
        (Number(p.hargaJual) || 0) * (Number(p.terjual) || 0),
      0
    )
  );

  $("totalLaba").textContent = rupiah(
    products.reduce(
      (sum, p) =>
        sum +
        ((Number(p.hargaJual) || 0) - (Number(p.hargaBeli) || 0)) *
          (Number(p.terjual) || 0),
      0
    )
  );
}

// =============================
// FORM
// =============================

function openAdd() {
  $("productForm").reset();
  $("editId").value = "";
  $("modalTitle").textContent = "Tambah Produk";
  $("photoPreview").src = "";
  $("photoPreview").classList.add("hidden");
  $("jumlahTerjual").value = 0;
  $("stok").value = 0;
  $("modal").classList.add("show");
  updatePreview();
}

function openEdit(id) {
  const p = products.find((x) => String(x.id) === String(id));
  if (!p) return;

  $("editId").value = p.id;
  $("modalTitle").textContent = "Edit Produk";
  $("nama").value = p.nama || "";
  $("kategori").value = p.kategori || "";
  $("hargaBeli").value = p.hargaBeli || 0;
  $("hargaJual").value = p.hargaJual || 0;
  $("stok").value = p.stok || 0;
  $("jumlahTerjual").value = p.terjual || 0;
  $("deskripsi").value = p.deskripsi || "";

  $("photoPreview").src = getImageUrl(p.gambar);
  $("photoPreview").classList.toggle("hidden", !p.gambar);

  $("modal").classList.add("show");
  updatePreview();
}

function closeModal() {
  $("modal").classList.remove("show");
}

async function saveProduct(e) {
  e.preventDefault();

  const submitButton = $("productForm").querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;
  submitButton.textContent = "Menyimpan...";

  try {
    const file = $("foto").files[0];
    let gambar = "";

    if (file) {
      gambar = await fileToDataUrl(file);
    } else {
      const old = products.find(
        (p) => String(p.id) === String($("editId").value)
      );
      gambar = old?.gambar || "";
    }

    const payload = {
      id: $("editId").value,
      nama: $("nama").value.trim(),
      kategori: $("kategori").value.trim(),
      hargaBeli: Number($("hargaBeli").value) || 0,
      hargaJual: Number($("hargaJual").value) || 0,
      stok: Number($("stok").value) || 0,
      terjual: Number($("jumlahTerjual").value) || 0,
      gambar,
      deskripsi: $("deskripsi").value.trim()
    };

    if (!payload.nama) {
      throw new Error("Nama produk wajib diisi.");
    }

    const action = payload.id ? "update" : "create";

    await submitToApi(action, payload);

    closeModal();

    alert(
      action === "create"
        ? "Produk berhasil dikirim ke database."
        : "Produk berhasil diperbarui."
    );

    loadProducts();
  } catch (err) {
    alert(err.message || "Gagal menyimpan produk.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Simpan";
  }
}

async function deleteProduct(id) {
  const p = products.find((x) => String(x.id) === String(id));

  if (!p) return;

  if (!confirm(`Hapus produk "${p.nama}"?`)) return;

  try {
    await submitToApi("delete", { id });

    alert("Produk berhasil dihapus.");
    loadProducts();
  } catch (err) {
    alert(err.message || "Gagal menghapus produk.");
  }
}

// =============================
// PREVIEW
// =============================

function updatePreview() {
  const margin =
    (Number($("hargaJual").value) || 0) -
    (Number($("hargaBeli").value) || 0);

  const laba =
    margin * (Number($("jumlahTerjual").value) || 0);

  $("previewMargin").textContent = rupiah(margin);
  $("previewLaba").textContent = rupiah(laba);
}

function previewPhoto() {
  const file = $("foto").files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    $("photoPreview").src = e.target.result;
    $("photoPreview").classList.remove("hidden");
  };

  reader.readAsDataURL(file);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {

    if (!file) {
      reject(new Error("File foto tidak ditemukan."));
      return;
    }

    // Maksimal file asli 5 MB
    if (file.size > 5 * 1024 * 1024) {
      reject(
        new Error(
          "Foto terlalu besar. Maksimal 5 MB."
        )
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {

      const img = new Image();

      img.onload = () => {

        const MAX_SIZE = 800;

        let width = img.width;
        let height = img.height;

        if (width > MAX_SIZE || height > MAX_SIZE) {

          if (width > height) {

            height = Math.round(
              (height / width) * MAX_SIZE
            );

            width = MAX_SIZE;

          } else {

            width = Math.round(
              (width / height) * MAX_SIZE
            );

            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(
          img,
          0,
          0,
          width,
          height
        );

        // Kompres lebih kecil agar aman dikirim ke Apps Script
        const compressed = canvas.toDataURL(
          "image/jpeg",
          0.65
        );

        resolve(compressed);
      };

      img.onerror = () => {
        reject(
          new Error("Foto tidak dapat dibaca.")
        );
      };

      img.src = reader.result;
    };

    reader.onerror = () => {
      reject(
        new Error("Gagal membaca file foto.")
      );
    };

    reader.readAsDataURL(file);
  });
}

// =============================
// SECURITY / HTML ESCAPE
// =============================

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function escapeAttr(v) {
  return escapeHtml(v);
}

window.openEdit = openEdit;
window.deleteProduct = deleteProduct;
