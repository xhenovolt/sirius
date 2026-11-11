"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ShellIcon from "./ShellIcon";
import AccountMenu from "./AccountMenu";
import { activeHref, breadcrumbs } from "./nav";

function NavEntries({ nav, pathname, collapsed, openGroups, onToggleGroup, onNavigate }) {
  const active = activeHref(nav, pathname);
  return (
    <nav className="shell-nav" aria-label="Main navigation">
      {nav.map((entry) => {
        if (!entry.items) {
          const isActive = active === entry.href;
          return (
            <Link key={entry.href} href={entry.href} onClick={onNavigate}
              className={`shell-link${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? entry.label : undefined}>
              <ShellIcon name={entry.icon} />
              <span className="shell-link-label">{entry.label}</span>
            </Link>
          );
        }
        const groupActive = entry.items.some((item) => item.href === active);
        const open = openGroups.includes(entry.label);
        return (
          <div key={entry.label} className={`shell-group${groupActive ? " has-active" : ""}`}>
            <button type="button" className="shell-link shell-group-toggle"
              aria-expanded={open} aria-controls={`shell-group-${entry.label.replace(/\s+/g, "-")}`}
              onClick={() => onToggleGroup(entry.label)} title={collapsed ? entry.label : undefined}>
              <ShellIcon name={entry.icon} />
              <span className="shell-link-label">{entry.label}</span>
              <ShellIcon name="chevron" className={`shell-chevron${open ? " open" : ""}`} />
            </button>
            {open && !collapsed && (
              <div className="shell-subnav" id={`shell-group-${entry.label.replace(/\s+/g, "-")}`}>
                {entry.items.map((item) => {
                  const isActive = active === item.href;
                  return (
                    <Link key={item.href} href={item.href} onClick={onNavigate}
                      className={`shell-sublink${isActive ? " active" : ""}`}
                      aria-current={isActive ? "page" : undefined}>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function AppShell({ nav, schoolName, user, children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState([]);
  const menuButtonRef = useRef(null);
  const drawerCloseRef = useRef(null);

  const active = activeHref(nav, pathname);
  const activeGroup = nav.find((entry) => entry.items?.some((item) => item.href === active))?.label;

  useEffect(() => {
    if (localStorage.getItem("sirius_sidebar_collapsed") === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (activeGroup) setOpenGroups((current) => current.includes(activeGroup) ? current : [...current, activeGroup]);
  }, [activeGroup]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus();
    function onKey(event) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  function toggleCollapse() {
    setCollapsed((value) => {
      localStorage.setItem("sirius_sidebar_collapsed", value ? "0" : "1");
      return !value;
    });
  }

  function toggleGroup(label) {
    if (collapsed) {
      setCollapsed(false);
      localStorage.setItem("sirius_sidebar_collapsed", "0");
      setOpenGroups((current) => current.includes(label) ? current : [...current, label]);
      return;
    }
    setOpenGroups((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
  }

  const crumbs = breadcrumbs(pathname, schoolName);

  return (
    <div className={`shell${collapsed ? " shell-collapsed" : ""}`}>
      <a className="shell-skip" href="#main-content">Skip to content</a>

      <aside className="shell-sidebar" aria-label="Sidebar">
        <Link className="shell-brand" href="/">
          <span className="shell-brand-mark">S</span>
          <span className="shell-brand-text">
            <strong>Sirius</strong>
            <small>{schoolName}</small>
          </span>
        </Link>
        <div className="shell-nav-scroll">
          <NavEntries nav={nav} pathname={pathname} collapsed={collapsed}
            openGroups={openGroups} onToggleGroup={toggleGroup} />
        </div>
        <button type="button" className="shell-collapse" onClick={toggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}>
          <ShellIcon name="collapse" className={collapsed ? "flipped" : ""} />
          <span className="shell-link-label">Collapse</span>
        </button>
      </aside>

      {drawerOpen && (
        <div className="shell-drawer-root">
          <div className="shell-drawer-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="shell-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="shell-drawer-head">
              <span className="shell-brand"><span className="shell-brand-mark">S</span><span className="shell-brand-text"><strong>Sirius</strong><small>{schoolName}</small></span></span>
              <button type="button" ref={drawerCloseRef} className="shell-drawer-close"
                onClick={() => { setDrawerOpen(false); menuButtonRef.current?.focus(); }} aria-label="Close menu">
                <ShellIcon name="x" />
              </button>
            </div>
            <div className="shell-nav-scroll">
              <NavEntries nav={nav} pathname={pathname} collapsed={false}
                openGroups={openGroups} onToggleGroup={toggleGroup} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="shell-main">
        <header className="shell-topbar">
          <button type="button" ref={menuButtonRef} className="shell-menu-btn"
            onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen}>
            <ShellIcon name="menu" />
          </button>
          <nav className="shell-crumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((crumb, index) => (
                <li key={crumb.href}>
                  {index > 0 && <span className="shell-crumb-sep" aria-hidden="true">/</span>}
                  {index === crumbs.length - 1
                    ? <span aria-current="page">{crumb.label}</span>
                    : <Link href={crumb.href}>{crumb.label}</Link>}
                </li>
              ))}
            </ol>
          </nav>
          <AccountMenu user={user} />
        </header>
        <div className="shell-content" id="main-content">{children}</div>
      </div>
    </div>
  );
}