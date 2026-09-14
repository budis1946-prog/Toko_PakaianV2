// ============================================================
// SCRIPT.JS - FRONTEND GITHUB PAGES
// Google Apps Script + Google Sheets + Google Drive
// ============================================================
// PERBEDAAN VERSI INI:
// 1. DATA produk dibaca dengan JSONP.
// 2. CREATE/UPDATE/DELETE memakai HTML form POST.
// 3. GAMBAR TIDAK lagi diambil langsung dari Google Drive.
// 4. GAMBAR diambil melalui IMAGE PROXY Apps Script.
// 5. Foto lama di Spreadsheet tetap kompatibel.
// 6. Foto besar dikompres otomatis di browser.
// ============================================================

const API_URL =
  "https://script.google.com/macros/s/AKfycby-YlkfI-Z1bwiK0ujaY-ArD0BSgw5BlNVqYFmeB0IGA09DHUFOEDEJbVBmVFesZ3d_KQ/exec";

const $ = (id) => document.getElementById(id);

const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(n) || 0);

let products = [];
let jsonpCounter = 0;

// ============================================================
// INIT
// ============================================================

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

// ============================================================
// API CHECK
// ============================================================

function ensureApi() {
  if (!API_URL || API_URL.includes("GANTI_DENGAN")) {
    alert("API_URL belum diisi.");
    return false;
  }

  return true;
}

// ============================================================
// JSONP HELPER
// ============================================================

function jsonpRequest(params, timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!ensureApi()) {
      reject(new Error("API belum dikonfigurasi."));
      return;
    }

    const callbackName =
      "__tokoCallback_" + (++jsonpCounter);

    let finished = false;

    const script = document.createElement("script");

    const cleanup = () => {
      delete window[callbackName];

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }

      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      if (finished) return;

      finished = true;
      cleanup();

      reject(
        new Error(
          "API tidak merespons dalam waktu yang ditentukan."
        )
      );
    }, timeout);

    window[callbackName] = (response) => {
      if (finished) return;

      finished = true;
      cleanup();

      if (!response) {
        reject(new Error("Response API kosong."));
        return;
      }

      if (response.success === false) {
        reject(
          new Error(
            response.message || "API mengembalikan error."
          )
        );
        return;
      }

      resolve(response);
    };

    const query = new URLSearchParams({
      ...params,
      callback: callbackName,
      _: Date.now().toString()
    });

    script.src = API_URL + "?" + query.toString();

    script.onerror = () => {
      if (finished) return;

      finished = true;
      cleanup();

      reject(
        new Error(
          "Gagal menghubungi Google Apps Script."
        )
      );
    };

    document.body.appendChild(script);
  });
}

// ============================================================
// LOAD PRODUCTS
// ============================================================

function loadProducts() {
  const callbackName =
    'jsonpCallback_' + Date.now();

  window[callbackName] = function(response) {
    try {
      if (!response || !response.success) {
        throw new Error(
          response?.message || 'Gagal mengambil data'
        );
      }

      products = response.data || [];

      renderProducts();
      updateDashboard();

    } catch (error) {
      console.error(error);
      showError(
        'Gagal memuat data: ' + error.message
      );
    } finally {
      delete window[callbackName];
      const script = document.getElementById(callbackName);

      if (script) {
        script.remove();
      }
    }
  };

  const script = document.createElement('script');

  script.id = callbackName;

  script.src =
    API_URL +
    '?action=list&callback=' +
    encodeURIComponent(callbackName);

  script.onerror = function() {
    delete window[callbackName];
    script.remove();

    showError(
      'Gagal menghubungi Google Apps Script.'
    );
  };

  document.body.appendChild(script);
}

function showLoadError(message) {
  $("productTableBody").innerHTML =
    `<tr>
       <td colspan="11">
         Gagal memuat data: ${escapeHtml(message)}
       </td>
     </tr>`;
}

// ============================================================
// WRITE FRAME
// ============================================================

function createWriteFrame() {
  if ($("apiWriteFrame")) return;

  const iframe = document.createElement("iframe");

  iframe.name = "apiWriteFrame";
  iframe.id = "apiWriteFrame";
  iframe.style.display = "none";

  document.body.appendChild(iframe);
}

// ============================================================
// POST API
// ============================================================

function submitToApi(action, payload) {
  return new Promise((resolve, reject) => {
    if (!ensureApi()) {
      reject(new Error("API belum dikonfigurasi."));
      return;
    }

    const form = document.createElement("form");

    form.method = "POST";
    form.action = API_URL;
    form.target = "apiWriteFrame";
    form.style.display = "none";

    const data = {
      action,
      ...payload
    };

    Object.keys(data).forEach((key) => {
      const input = document.createElement("input");

      input.type = "hidden";
      input.name = key;
      input.value =
        data[key] == null ? "" : String(data[key]);

      form.appendChild(input);
    });

    document.body.appendChild(form);

    try {
      form.submit();
    } catch (err) {
      form.remove();
      reject(err);
      return;
    }

    // Apps Script memproses POST di iframe.
    // Setelah cukup waktu, baca ulang database.
    setTimeout(() => {
      form.remove();
      resolve();
    }, 1800);
  });
}

// ============================================================
// IMAGE ID
// ============================================================

function getDriveFileId(value) {
  if (!value) return "";

  const url = String(value).trim();

  // File ID langsung
  if (/^[A-Za-z0-9_-]{20,}$/.test(url)) {
    return url;
  }

  // thumbnail?id=FILE_ID
  let match = url.match(/[?&]id=([A-Za-z0-9_-]+)/i);

  if (match) {
    return match[1];
  }

  // /file/d/FILE_ID
  match = url.match(
    /\/file\/d\/([A-Za-z0-9_-]+)/i
  );

  if (match) {
    return match[1];
  }

  // /d/FILE_ID
  match = url.match(
    /\/d\/([A-Za-z0-9_-]+)/i
  );

  if (match) {
    return match[1];
  }

  return "";
}

// ============================================================
// IMAGE PROXY
// ============================================================

async function loadDriveImage(value, imgElement) {
  if (!imgElement || !value) return;

  const url = String(value).trim();

  // Base64 langsung
  if (url.startsWith("data:image/")) {
    imgElement.src = url;
    imgElement.classList.add("loaded");
    return;
  }

  const fileId = getDriveFileId(url);

  if (!fileId) {
    showImageError(imgElement);
    return;
  }

  try {
    const response = await jsonpRequest(
      {
        action: "image",
        id: fileId
      },
      30000
    );

    if (
      !response.data ||
      !response.mimeType
    ) {
      throw new Error("Data gambar kosong.");
    }

    imgElement.src =
      "data:" +
      response.mimeType +
      ";base64," +
      response.data;

    imgElement.classList.add("loaded");

  } catch (err) {
    console.error(
      "Gagal memuat gambar:",
      fileId,
      err
    );

    showImageError(imgElement);
  }
}

function showImageError(imgElement) {
  imgElement.removeAttribute("src");
  imgElement.alt = "Foto tidak tersedia";
  imgElement.classList.add("image-error");
}

// ============================================================
// RENDER
// ============================================================

function render() {
  const q =
    $("searchInput").value
      .trim()
      .toLowerCase();

  const filtered = products.filter((p) =>
    [p.nama, p.kategori, p.deskripsi]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );

  $("emptyState").style.display =
    filtered.length ? "none" : "block";

  $("productTableBody").innerHTML =
    filtered
      .map((p, index) => {
        const margin =
          (Number(p.hargaJual) || 0) -
          (Number(p.hargaBeli) || 0);

        const terjual =
          Number(p.terjual) || 0;

        const laba =
          margin * terjual;

        const imageId =
          "product-image-" + index;

        return `
          <tr>
            <td>
              ${
                p.gambar
                  ? `
                    <div class="product-image-wrap">
                      <img
                        id="${imageId}"
                        class="product-img"
                        alt="${escapeAttr(
                          p.nama || "Foto produk"
                        )}"
                      >
                    </div>
                  `
                  : `
                    <div class="product-img no-image">
                      -
                    </div>
                  `
              }
            </td>

            <td>
              <strong>${escapeHtml(p.nama)}</strong>
            </td>

            <td>
              ${escapeHtml(p.kategori || "-")}
            </td>

            <td>
              ${rupiah(p.hargaBeli)}
            </td>

            <td>
              ${rupiah(p.hargaJual)}
            </td>

            <td>
              ${Number(p.stok) || 0}
            </td>

            <td>
              ${terjual}
            </td>

            <td>
              ${rupiah(margin)}
            </td>

            <td>
              ${rupiah(laba)}
            </td>

            <td>
              ${escapeHtml(p.deskripsi || "-")}
            </td>

            <td>
              <button
                class="action-btn"
                onclick="openEdit('${escapeAttr(p.id)}')"
              >
                Edit
              </button>

              <button
                class="action-btn action-delete"
                onclick="deleteProduct('${escapeAttr(p.id)}')"
              >
                Hapus
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

  // Load semua gambar setelah HTML dibuat.
  filtered.forEach((p, index) => {
    if (!p.gambar) return;

    const img =
      $("product-image-" + index);

    loadDriveImage(p.gambar, img);
  });

  // Statistik
  $("totalProduk").textContent =
    products.length;

  $("totalTerjual").textContent =
    products.reduce(
      (sum, p) =>
        sum + (Number(p.terjual) || 0),
      0
    );

  $("totalPenjualan").textContent =
    rupiah(
      products.reduce(
        (sum, p) =>
          sum +
          (Number(p.hargaJual) || 0) *
            (Number(p.terjual) || 0),
        0
      )
    );

  $("totalLaba").textContent =
    rupiah(
      products.reduce(
        (sum, p) =>
          sum +
          (
            (Number(p.hargaJual) || 0) -
            (Number(p.hargaBeli) || 0)
          ) *
            (Number(p.terjual) || 0),
        0
      )
    );
}

// ============================================================
// ADD
// ============================================================

function openAdd() {
  $("productForm").reset();

  $("editId").value = "";

  $("modalTitle").textContent =
    "Tambah Produk";

  $("photoPreview").src = "";
  $("photoPreview").classList.add("hidden");

  $("jumlahTerjual").value = 0;
  $("stok").value = 0;

  $("modal").classList.add("show");

  updatePreview();
}

// ============================================================
// EDIT
// ============================================================

function openEdit(id) {
  const p = products.find(
    (x) => String(x.id) === String(id)
  );

  if (!p) return;

  $("editId").value = p.id;

  $("modalTitle").textContent =
    "Edit Produk";

  $("nama").value = p.nama || "";
  $("kategori").value =
    p.kategori || "";

  $("hargaBeli").value =
    p.hargaBeli || 0;

  $("hargaJual").value =
    p.hargaJual || 0;

  $("stok").value =
    p.stok || 0;

  $("jumlahTerjual").value =
    p.terjual || 0;

  $("deskripsi").value =
    p.deskripsi || "";

  $("photoPreview").src = "";
  $("photoPreview").classList.toggle(
    "hidden",
    !p.gambar
  );

  if (p.gambar) {
    loadDriveImage(
      p.gambar,
      $("photoPreview")
    );
  }

  $("modal").classList.add("show");

  updatePreview();
}

// ============================================================
// CLOSE
// ============================================================

function closeModal() {
  $("modal").classList.remove("show");
}

// ============================================================
// SAVE
// ============================================================

async function saveProduct(e) {
  e.preventDefault();

  const form =
    $("productForm");

  const submitButton =
    form.querySelector(
      'button[type="submit"]'
    );

  submitButton.disabled = true;
  submitButton.textContent =
    "Menyimpan...";

  try {
    const file =
      $("foto").files[0];

    let gambar = "";

    if (file) {
      gambar =
        await fileToDataUrl(file);
    } else {
      const old =
        products.find(
          (p) =>
            String(p.id) ===
            String($("editId").value)
        );

      gambar =
        old?.gambar || "";
    }

    const payload = {
      id: $("editId").value,

      nama:
        $("nama").value.trim(),

      kategori:
        $("kategori").value.trim(),

      hargaBeli:
        Number($("hargaBeli").value) || 0,

      hargaJual:
        Number($("hargaJual").value) || 0,

      stok:
        Number($("stok").value) || 0,

      terjual:
        Number($("jumlahTerjual").value) || 0,

      gambar,

      deskripsi:
        $("deskripsi").value.trim()
    };

    if (!payload.nama) {
      throw new Error(
        "Nama produk wajib diisi."
      );
    }

    if (
      payload.hargaJual <
      payload.hargaBeli
    ) {
      if (
        !confirm(
          "Harga jual lebih kecil dari harga beli. Tetap simpan?"
        )
      ) {
        return;
      }
    }

    const action =
      payload.id
        ? "update"
        : "create";

    await submitToApi(
      action,
      payload
    );

    closeModal();

    alert(
      action === "create"
        ? "Produk berhasil disimpan."
        : "Produk berhasil diperbarui."
    );

    await wait(500);

    loadProducts();

  } catch (err) {
    alert(
      err.message ||
      "Gagal menyimpan produk."
    );

  } finally {
    submitButton.disabled = false;
    submitButton.textContent =
      "Simpan";
  }
}

// ============================================================
// DELETE
// ============================================================

async function deleteProduct(id) {
  const p =
    products.find(
      (x) =>
        String(x.id) ===
        String(id)
    );

  if (!p) return;

  if (
    !confirm(
      `Hapus produk "${p.nama}"?`
    )
  ) {
    return;
  }

  try {
    await submitToApi(
      "delete",
      { id }
    );

    alert(
      "Produk berhasil dihapus."
    );

    await wait(500);

    loadProducts();

  } catch (err) {
    alert(
      err.message ||
      "Gagal menghapus produk."
    );
  }
}

// ============================================================
// PREVIEW
// ============================================================

function updatePreview() {
  const margin =
    (Number($("hargaJual").value) || 0) -
    (Number($("hargaBeli").value) || 0);

  const laba =
    margin *
    (Number($("jumlahTerjual").value) || 0);

  $("previewMargin").textContent =
    rupiah(margin);

  $("previewLaba").textContent =
    rupiah(laba);
}

function previewPhoto() {
  const file =
    $("foto").files[0];

  if (!file) return;

  const reader =
    new FileReader();

  reader.onload = (e) => {
    $("photoPreview").src =
      e.target.result;

    $("photoPreview")
      .classList.remove("hidden");
  };

  reader.onerror = () => {
    alert(
      "Foto tidak dapat dibaca."
    );
  };

  reader.readAsDataURL(file);
}

// ============================================================
// KOMPRES FOTO
// Tidak ada batas 5 MB pada file asli.
// Browser akan resize dan kompres terlebih dahulu.
// ============================================================

function fileToDataUrl(file) {
  return new Promise(
    (resolve, reject) => {
      if (!file) {
        reject(
          new Error(
            "File foto tidak ditemukan."
          )
        );
        return;
      }

      const reader =
        new FileReader();

      reader.onload = () => {
        const img =
          new Image();

        img.onload = () => {
          const MAX_SIZE = 1000;

          let width =
            img.naturalWidth ||
            img.width;

          let height =
            img.naturalHeight ||
            img.height;

          if (
            width > MAX_SIZE ||
            height > MAX_SIZE
          ) {
            if (width > height) {
              height =
                Math.round(
                  (height / width) *
                    MAX_SIZE
                );

              width = MAX_SIZE;

            } else {
              width =
                Math.round(
                  (width / height) *
                    MAX_SIZE
                );

              height = MAX_SIZE;
            }
          }

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width = width;
          canvas.height = height;

          const ctx =
            canvas.getContext("2d");

          if (!ctx) {
            reject(
              new Error(
                "Browser tidak mendukung Canvas."
              )
            );
            return;
          }

          ctx.drawImage(
            img,
            0,
            0,
            width,
            height
          );

          // Semua foto dikirim sebagai JPG
          // agar ukuran jauh lebih kecil.
          const result =
            canvas.toDataURL(
              "image/jpeg",
              0.70
            );

          if (
            result.length >
            1500000
          ) {
            reject(
              new Error(
                "Foto masih terlalu besar setelah kompresi. Silakan gunakan foto yang lebih kecil."
              )
            );
            return;
          }

          resolve(result);
        };

        img.onerror = () => {
          reject(
            new Error(
              "Foto tidak dapat dibaca oleh browser."
            )
          );
        };

        img.src =
          reader.result;
      };

      reader.onerror = () => {
        reject(
          new Error(
            "Gagal membaca file foto."
          )
        );
      };

      reader.readAsDataURL(file);
    }
  );
}

// ============================================================
// UTILITY
// ============================================================

function wait(ms) {
  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}

function escapeHtml(v) {
  return String(
    v ?? ""
  ).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[c]
  );
}

function escapeAttr(v) {
  return escapeHtml(v);
}

// ============================================================
// GLOBAL
// ============================================================

window.openEdit =
  openEdit;

window.deleteProduct =
  deleteProduct;
